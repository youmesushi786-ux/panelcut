"""FastAPI application for panel cutting optimizer with Mpesa order flow."""

import logging
from datetime import datetime
import uuid
from typing import Optional, Dict, Any
import os
import base64
import smtplib
from email.message import EmailMessage
import json

import requests
from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from app.schemas import (
    CuttingRequest,
    CuttingResponse,
    HealthResponse,
    EdgingDetail,
    EdgingSummary,
    BOQItem,
    BOQSummary,
    PricingSummary,
)
from app.core.optimizer import optimize_cutting
from app.core.pricing import calculate_pricing, get_board_price_per_sheet
from app.config import (
    DEFAULT_BOARD_WIDTH_MM,
    DEFAULT_BOARD_LENGTH_MM,
    DEFAULT_KERF_MM,
    CUTTING_PRICE_PER_BOARD,
    EDGING_PRICE_PER_METER,
    CLIENT_EDGING_PRICE_PER_METER,
    TAX_RATE,
    CURRENCY,
    COMPANY_INFO,
    BOARD_CATALOG,
    BOARD_COLORS,
    BOARD_PRICE_TABLE,
)
from app.orders import ORDER_STORE, Order

# -------- Logging setup --------
logger = logging.getLogger("panelpro")
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
# -------------------------------

app = FastAPI(
    title="Panel Cutting Optimizer API",
    description="Advanced panel cutting layout, pricing & Mpesa order API",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # adjust for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/", tags=["Info"])
def root():
    return {
        "name": "Panel Cutting Optimizer",
        "version": "1.0.0",
        "endpoints": {
            "health": "/health",
            "pricing": "/api/pricing",
            "boards_catalog": "/api/boards/catalog",
            "optimize": "/api/optimize",
            "order_create": "/api/order/create",
            "mpesa_initiate": "/api/mpesa/initiate",
            "payment_status": "/api/payment/status",
            "notify_after_payment": "/api/notify/after-payment",
        },
    }


@app.get("/health", response_model=HealthResponse, tags=["Health"])
def health():
    return HealthResponse()


@app.get("/api/pricing", tags=["Config"])
def pricing_config():
    return {
        "kerf_default": DEFAULT_KERF_MM,
        "cutting_per_board": CUTTING_PRICE_PER_BOARD,
        "edging_per_meter_factory": EDGING_PRICE_PER_METER,
        "edging_per_meter_client": CLIENT_EDGING_PRICE_PER_METER,
        "currency": CURRENCY,
        "tax_rate": TAX_RATE,
    }


class BoardCatalogResponse(BaseModel):
    catalog: Dict[str, Any]
    colors: Dict[str, Any]
    price_table: Dict[str, Any]


@app.get("/api/boards/catalog", response_model=BoardCatalogResponse, tags=["Config"])
def boards_catalog():
    return BoardCatalogResponse(
        catalog=BOARD_CATALOG,
        colors=BOARD_COLORS,
        price_table=BOARD_PRICE_TABLE,
    )


# ---------- Core optimization logic (used by /api/optimize and /api/order/create) ----------

def process_optimization(request: CuttingRequest) -> CuttingResponse:
    logger.info(
        "OPTIMIZE START: panels=%d, core=%s, thickness=%s, company=%s, supply=%s",
        len(request.panels),
        request.board.core_type.value,
        request.board.thickness_mm.value,
        request.board.company,
        "client" if request.supply.client_supply else "factory",
    )
    # size validation
    for idx, p in enumerate(request.panels):
        if p.width > DEFAULT_BOARD_WIDTH_MM and p.length > DEFAULT_BOARD_WIDTH_MM:
            msg = (
                f"Panel {idx+1} ({p.width}x{p.length}mm) too wide "
                f"for board {DEFAULT_BOARD_WIDTH_MM}mm"
            )
            logger.warning(msg)
            raise HTTPException(400, msg)
        if p.width > DEFAULT_BOARD_LENGTH_MM and p.length > DEFAULT_BOARD_LENGTH_MM:
            msg = (
                f"Panel {idx+1} ({p.width}x{p.length}mm) too long "
                f"for board {DEFAULT_BOARD_LENGTH_MM}mm"
            )
            logger.warning(msg)
            raise HTTPException(400, msg)

    # 1) optimization
    layouts, summary = optimize_cutting(request)
    logger.info(
        "Optimizer done: boards=%d, waste=%.2f%%, cuts=%d",
        summary.total_boards,
        summary.total_waste_percent,
        summary.total_cuts,
    )

    # 2) edging
    total_edge_mm = 0.0
    edging_details: list[EdgingDetail] = []
    for idx, p in enumerate(request.panels):
        per_panel_m = p.edge_length_mm / 1000
        total_m = p.total_edge_length_mm / 1000
        total_edge_mm += p.total_edge_length_mm
        if per_panel_m > 0:
            edges_str = "".join(
                [
                    "L" if p.edging.left else "",
                    "R" if p.edging.right else "",
                    "T" if p.edging.top else "",
                    "B" if p.edging.bottom else "",
                ]
            ) or "None"
            edging_details.append(
                EdgingDetail(
                    panel_label=p.label or f"Panel {idx+1}",
                    quantity=p.quantity,
                    edge_per_panel_m=round(per_panel_m, 3),
                    total_edge_m=round(total_m, 2),
                    edges_applied=edges_str,
                )
            )

    total_edging_m = round(total_edge_mm / 1000, 2)
    summary.total_edging_meters = total_edging_m
    logger.info("Total edging: %.2f m", total_edging_m)

    # 3) pricing
    pricing: PricingSummary = calculate_pricing(request, summary, total_edging_m)
    logger.info(
        "Pricing: subtotal=%.2f %s, tax=%.2f, total=%.2f",
        pricing.subtotal,
        pricing.currency,
        pricing.tax_amount,
        pricing.total,
    )

    # 4) BOQ items
    boq_items: list[BOQItem] = []
    for idx, p in enumerate(request.panels):
        size = f"{int(p.width)}×{int(p.length)} mm"
        edges_str = "".join(
            [
                "L" if p.edging.left else "",
                "R" if p.edging.right else "",
                "T" if p.edging.top else "",
                "B" if p.edging.bottom else "",
            ]
        ) or "None"
        boq_items.append(
            BOQItem(
                item_no=idx + 1,
                description=p.label or f"Panel {idx+1}",
                size=size,
                quantity=p.quantity,
                unit="pcs",
                edges=edges_str,
            )
        )

    materials = {
        "board_type": f"{request.board.core_type.value.upper()} {int(request.board.thickness_mm.value)}mm",
        "board_company": request.board.company,
        "board_color": request.board.color_name,
        "board_size": f"{DEFAULT_BOARD_WIDTH_MM}×{DEFAULT_BOARD_LENGTH_MM} mm",
        "boards_required": summary.total_boards,
        "board_price": get_board_price_per_sheet(request.board),
        "supplied_by": pricing.supplied_by,
    }

    # Edging rate & meters used for BOQ should match calculate_pricing
    if request.supply.client_supply:
        effective_edging_m = (
            request.supply.client_edging_meters
            if request.supply.client_edging_meters is not None
            else total_edging_m
        )
        edging_rate = CLIENT_EDGING_PRICE_PER_METER
    else:
        effective_edging_m = total_edging_m
        edging_rate = EDGING_PRICE_PER_METER

    services = {
        "cutting": {
            "boards": summary.total_boards,
            "price_per_board": CUTTING_PRICE_PER_BOARD,
            "total": summary.total_boards * CUTTING_PRICE_PER_BOARD,
        },
        "edging": {
            "meters": effective_edging_m,
            "price_per_meter": edging_rate,
            "total": round(effective_edging_m * edging_rate, 2),
        },
    }

    boq = BOQSummary(
        project_name=request.project_name,
        customer_name=request.customer_name,
        date=datetime.utcnow().strftime("%Y-%m-%d"),
        items=boq_items,
        materials=materials,
        services=services,
        pricing=pricing,
    )

    # client supply sufficiency
    if request.supply.client_supply:
        required = summary.total_boards
        supplied = request.supply.client_board_qty or 0
        if supplied < required:
            msg = f"Insufficient boards: need {required}, client supplies {supplied}"
            logger.warning(msg)
            raise HTTPException(400, msg)

    report_id = f"RPT-{datetime.utcnow().strftime('%Y%m%d')}-{uuid.uuid4().hex[:6].upper()}"
    logger.info("OPTIMIZE SUCCESS: report_id=%s", report_id)

    request_summary = {
        "panels_count": len(request.panels),
        "total_pieces": summary.total_panels,
        "board_type": f"{request.board.core_type.value.upper()} {int(request.board.thickness_mm.value)}mm",
        "company": request.board.company,
        "color": request.board.color_name,
        "supply_mode": "Client" if request.supply.client_supply else "Factory",
        "project": request.project_name,
        "customer": request.customer_name,
    }

    edging_summary = EdgingSummary(total_meters=total_edging_m, details=edging_details)

    return CuttingResponse(
        request_summary=request_summary,
        optimization=summary,
        layouts=layouts,
        edging=edging_summary,
        boq=boq,
        report_id=report_id,
    )


# ---------- Routes ----------

@app.post("/api/optimize", response_model=CuttingResponse, tags=["Optimization"])
def optimize_route(request: CuttingRequest):
    return process_optimization(request)


# ---------- Orders & Mpesa (real integration) ----------

# ---- M-Pesa configuration ----
MPESA_ENV = os.getenv("MPESA_ENV", "sandbox")  # "sandbox" or "production"
MPESA_CONSUMER_KEY = os.getenv("MPESA_CONSUMER_KEY", "")
MPESA_CONSUMER_SECRET = os.getenv("MPESA_CONSUMER_SECRET", "")
MPESA_SHORTCODE = os.getenv("MPESA_SHORTCODE", "")
MPESA_PASSKEY = os.getenv("MPESA_PASSKEY", "")
MPESA_CALLBACK_URL = os.getenv("MPESA_CALLBACK_URL", "")

MPESA_BASE_URL = (
    "https://api.safaricom.co.ke"
    if MPESA_ENV == "production"
    else "https://sandbox.safaricom.co.ke"
)

# map CheckoutRequestID -> order_id so callback can find the order
MPESA_CHECKOUT_TO_ORDER: Dict[str, str] = {}


def _mpesa_timestamp() -> str:
    return datetime.utcnow().strftime("%Y%m%d%H%M%S")


def _mpesa_password(shortcode: str, passkey: str, timestamp: str) -> str:
    data = f"{shortcode}{passkey}{timestamp}"
    return base64.b64encode(data.encode()).decode()


def _mpesa_access_token() -> str:
    if not MPESA_CONSUMER_KEY or not MPESA_CONSUMER_SECRET:
        raise RuntimeError("M-Pesa consumer key/secret not configured")

    auth_str = f"{MPESA_CONSUMER_KEY}:{MPESA_CONSUMER_SECRET}"
    auth_b64 = base64.b64encode(auth_str.encode()).decode()

    resp = requests.get(
        f"{MPESA_BASE_URL}/oauth/v1/generate?grant_type=client_credentials",
        headers={"Authorization": f"Basic {auth_b64}"},
        timeout=10,
    )
    resp.raise_for_status()
    return resp.json()["access_token"]


def initiate_stk_push(order: Order, phone_number: str) -> dict:
    """
    Call Safaricom Daraja STK Push API.
    """
    if not (MPESA_SHORTCODE and MPESA_PASSKEY and MPESA_CALLBACK_URL):
        raise RuntimeError("M-Pesa shortcode/passkey/callback URL not configured")

    token = _mpesa_access_token()
    timestamp = _mpesa_timestamp()
    password = _mpesa_password(MPESA_SHORTCODE, MPESA_PASSKEY, timestamp)

    amount = int(round(order.amount))

    payload = {
        "BusinessShortCode": MPESA_SHORTCODE,
        "Password": password,
        "Timestamp": timestamp,
        "TransactionType": "CustomerPayBillOnline",
        "Amount": amount,
        "PartyA": phone_number,
        "PartyB": MPESA_SHORTCODE,
        "PhoneNumber": phone_number,
        "CallBackURL": MPESA_CALLBACK_URL,
        "AccountReference": order.id,
        "TransactionDesc": f"Order {order.id} payment",
    }

    logger.info("M-PESA STK PUSH REQUEST: %s", payload)

    resp = requests.post(
        f"{MPESA_BASE_URL}/mpesa/stkpush/v1/processrequest",
        json=payload,
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
        timeout=15,
    )
    resp.raise_for_status()
    data = resp.json()
    logger.info("M-PESA STK PUSH RESPONSE: %s", data)

    checkout_id = data.get("CheckoutRequestID")
    if checkout_id:
        MPESA_CHECKOUT_TO_ORDER[checkout_id] = order.id

    return data


# ---- WhatsApp Cloud API configuration ----
WHATSAPP_PHONE_NUMBER_ID = os.getenv("WHATSAPP_PHONE_NUMBER_ID", "")
WHATSAPP_ACCESS_TOKEN = os.getenv("WHATSAPP_ACCESS_TOKEN", "")
WHATSAPP_TEMPLATE_INVOICE = os.getenv("WHATSAPP_TEMPLATE_INVOICE", "invoice_notification")
WHATSAPP_TEMPLATE_PAYMENT = os.getenv("WHATSAPP_TEMPLATE_PAYMENT", "payment_receipt")
WHATSAPP_TEMPLATE_FACTORY_ORDER = os.getenv("WHATSAPP_TEMPLATE_FACTORY_ORDER", "")

WHATSAPP_API_URL = (
    f"https://graph.facebook.com/v18.0/{WHATSAPP_PHONE_NUMBER_ID}/messages"
    if WHATSAPP_PHONE_NUMBER_ID
    else None
)

FACTORY_ORDER_URL_BASE = os.getenv("FACTORY_ORDER_URL_BASE", "")


def send_whatsapp_template(to: str, template_name: str, params: list[str]) -> None:
    if not (WHATSAPP_API_URL and WHATSAPP_ACCESS_TOKEN and to and template_name):
        return

    components = []
    if params:
        components.append(
            {
                "type": "body",
                "parameters": [{"type": "text", "text": str(p)} for p in params],
            }
        )

    payload = {
        "messaging_product": "whatsapp",
        "to": to,
        "type": "template",
        "template": {
            "name": template_name,
            "language": {"code": "en"},
            "components": components,
        },
    }

    try:
        resp = requests.post(
            WHATSAPP_API_URL,
            json=payload,
            headers={
                "Authorization": f"Bearer {WHATSAPP_ACCESS_TOKEN}",
                "Content-Type": "application/json",
            },
            timeout=10,
        )
        logger.info(
            "WHATSAPP SEND (%s) -> %s %s",
            template_name,
            to,
            resp.text[:400],
        )
    except Exception as e:
        logger.error("WHATSAPP ERROR: %s", e)


# ---- Email / SMTP configuration ----
SMTP_HOST = os.getenv("SMTP_HOST", "")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USER", "")
SMTP_PASS = os.getenv("SMTP_PASS", "")
SMTP_FROM = os.getenv("SMTP_FROM", COMPANY_INFO.get("email", "noreply@example.com"))


def send_email(to_email: str, subject: str, body: str) -> None:
    if not (SMTP_HOST and SMTP_USER and SMTP_PASS and to_email):
        logger.warning("Email not sent, SMTP or recipient not configured")
        return

    msg = EmailMessage()
    msg["From"] = SMTP_FROM
    msg["To"] = to_email
    msg["Subject"] = subject
    msg.set_content(body)

    try:
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=10) as server:
            server.starttls()
            server.login(SMTP_USER, SMTP_PASS)
            server.send_message(msg)
        logger.info("EMAIL SENT to %s: %s", to_email, subject)
    except Exception as e:
        logger.error("EMAIL ERROR: %s", e)


# ---------- API models & endpoints for orders / payments ----------

class OrderCreateResponse(BaseModel):
    order_id: str
    amount: float
    currency: str
    customer_name: Optional[str]
    customer_phone: Optional[str]


@app.post("/api/order/create", response_model=OrderCreateResponse, tags=["Orders"])
def create_order(request: CuttingRequest, background_tasks: BackgroundTasks):
    """
    Create an order by running optimization, store it, return order_id and amount.
    Also sends an invoice (WhatsApp + email) in the background.
    """
    result = process_optimization(request)
    amount = result.boq.pricing.total
    currency = result.boq.pricing.currency

    order_id = result.report_id
    ORDER_STORE.create_order(
        Order(
            id=order_id,
            request=request,
            result=result,
            amount=amount,
            currency=currency,
            customer_name=request.customer_name,
            customer_email=request.customer_email,
            customer_phone=request.customer_phone,
        )
    )
    logger.info("ORDER CREATED: id=%s amount=%.2f %s", order_id, amount, currency)

    background_tasks.add_task(send_invoice_for_order, order_id)

    return OrderCreateResponse(
        order_id=order_id,
        amount=amount,
        currency=currency,
        customer_name=request.customer_name,
        customer_phone=request.customer_phone,
    )


class MpesaInitRequest(BaseModel):
    order_id: str
    phone_number: str  # 2547XXXXXXXX


class MpesaInitResponse(BaseModel):
    payment_request_id: str
    status: str
    message: str


@app.post("/api/mpesa/initiate", response_model=MpesaInitResponse, tags=["Payments"])
def mpesa_initiate(req: MpesaInitRequest):
    """
    Initiate real Mpesa STK Push using Safaricom Daraja.
    """
    order = ORDER_STORE.get_order(req.order_id)
    if not order:
        raise HTTPException(404, f"Order {req.order_id} not found")

    logger.info(
        "M-PESA INITIATE: order_id=%s amount=%.2f phone=%s",
        req.order_id,
        order.amount,
        req.phone_number,
    )

    order.mpesa_phone = req.phone_number

    try:
        data = initiate_stk_push(order, req.phone_number)
    except requests.HTTPError as e:
        logger.error("M-PESA HTTP ERROR: %s / %s", e, getattr(e.response, "text", ""))
        raise HTTPException(502, "Failed to initiate M-Pesa STK Push")
    except Exception as e:
        logger.error("M-PESA ERROR: %s", e)
        raise HTTPException(500, "Error initiating M-Pesa STK Push")

    return MpesaInitResponse(
        payment_request_id=data.get("CheckoutRequestID", ""),
        status="pending",
        message=data.get("CustomerMessage", "M-Pesa STK Push initiated"),
    )


class PaymentStatusResponse(BaseModel):
    order_id: str
    status: str
    mpesa_receipt: Optional[str] = None
    status_reason: Optional[str] = None


@app.get("/api/payment/status", response_model=PaymentStatusResponse, tags=["Payments"])
def payment_status(order_id: str):
    order = ORDER_STORE.get_order(order_id)
    if not order:
        raise HTTPException(404, f"Order {order_id} not found")
    return PaymentStatusResponse(
        order_id=order.id,
        status=order.status,
        mpesa_receipt=order.mpesa_receipt,
        status_reason=getattr(order, "status_reason", None),
    )


# ---------- M-Pesa STK callback endpoint ----------

@app.post("/mpesa/stk-callback", tags=["Payments"])
def mpesa_stk_callback(payload: dict, background_tasks: BackgroundTasks):
    """
    Safaricom calls this URL after the user approves/declines the STK push.
    Configure this as MPESA_CALLBACK_URL in Daraja.

    This endpoint marks the order as PAID or FAILED.
    Notifications (email/WhatsApp) are triggered by the frontend
    via /api/notify/after-payment once the UI sees status=paid.
    """
    logger.info("M-PESA CALLBACK RAW: %s", payload)

    try:
        stk = payload["Body"]["stkCallback"]
    except Exception:
        logger.error("Invalid M-Pesa callback payload")
        return {"status": "ok"}  # Always 200 OK to Safaricom

    result_code = stk.get("ResultCode")
    result_desc = stk.get("ResultDesc")
    checkout_id = stk.get("CheckoutRequestID")

    order_id = MPESA_CHECKOUT_TO_ORDER.get(checkout_id)
    if not order_id:
        logger.error("No order mapping for CheckoutRequestID=%s", checkout_id)
        return {"status": "ok"}

    if result_code != 0:
        logger.warning(
            "M-PESA FAILURE: order_id=%s ResultCode=%s desc=%s",
            order_id,
            result_code,
            result_desc,
        )
        try:
            ORDER_STORE.mark_failed(order_id, result_desc)
        except Exception:
            pass
        return {"status": "ok"}

    items = stk.get("CallbackMetadata", {}).get("Item", [])
    meta = {item["Name"]: item.get("Value") for item in items}

    amount = meta.get("Amount")
    receipt = meta.get("MpesaReceiptNumber")
    phone = meta.get("PhoneNumber")
    raw_txn_date = meta.get("TransactionDate")

    txn_dt = None
    if raw_txn_date:
        try:
            txn_dt = datetime.strptime(str(raw_txn_date), "%Y%m%d%H%M%S")
        except ValueError:
            logger.warning("Could not parse TransactionDate: %s", raw_txn_date)

    logger.info(
        "M-PESA SUCCESS: order_id=%s amount=%s receipt=%s phone=%s txn_date=%s",
        order_id,
        amount,
        receipt,
        phone,
        raw_txn_date,
    )

    try:
        ORDER_STORE.mark_paid(
            order_id,
            receipt,
            amount=float(amount) if amount is not None else None,
            phone=str(phone) if phone is not None else None,
            txn_date=txn_dt,
        )
    except TypeError:
        ORDER_STORE.mark_paid(order_id, receipt)

    # Do NOT send notifications here; frontend will trigger /api/notify/after-payment
    return {"status": "ok"}


# ---------- Notification helpers (invoice + payment) ----------

def _build_invoice_text(order: Order, include_receipt: bool = False) -> str:
    result = order.result
    pricing = result.boq.pricing

    base = (
        f"Invoice for order {order.id}\n"
        f"Customer: {order.customer_name or '-'}\n"
        f"Phone: {order.customer_phone or '-'}\n"
        f"Email: {order.customer_email or '-'}\n"
        f"Total: {pricing.total} {pricing.currency}\n"
        f"Boards: {result.optimization.total_boards}\n"
        f"Panels: {result.optimization.total_panels}\n"
    )

    if include_receipt and order.mpesa_receipt:
        base += f"M-Pesa Receipt: {order.mpesa_receipt}\n"

    return base


def _build_factory_email_body(order: Order, include_receipt: bool = False) -> str:
    res = order.result
    boq = res.boq
    opt = res.optimization
    req = order.request

    lines: list[str] = []

    lines.append(f"NEW CUTTING ORDER: {order.id}")
    lines.append(f"Created at: {order.created_at.isoformat()} UTC")
    lines.append(f"Status: {order.status}")
    if include_receipt and order.mpesa_receipt:
        lines.append(f"M-Pesa Receipt: {order.mpesa_receipt}")
    lines.append("")

    lines.append("=== CUSTOMER / PROJECT ===")
    lines.append(f"Project: {boq.project_name or getattr(req, 'project_name', '') or '-'}")
    lines.append(f"Customer name: {order.customer_name or getattr(req, 'customer_name', '') or '-'}")
    lines.append(f"Customer phone: {order.customer_phone or getattr(req, 'customer_phone', '') or '-'}")
    lines.append(f"Customer email: {order.customer_email or getattr(req, 'customer_email', '') or '-'}")
    lines.append(f"Notes: {getattr(req, 'notes', '') or '-'}")
    lines.append("")

    p = boq.pricing
    lines.append("=== PRICING SUMMARY ===")
    lines.append(f"Subtotal: {p.subtotal} {p.currency}")
    lines.append(f"{p.tax_name} ({p.tax_rate}%): {p.tax_amount} {p.currency}")
    lines.append(f"TOTAL: {p.total} {p.currency}")
    lines.append(f"Supplied by: {boq.materials.get('supplied_by', '-')}")
    lines.append("")

    lines.append("=== OPTIMIZATION SUMMARY ===")
    lines.append(f"Total boards: {opt.total_boards}")
    lines.append(f"Total panels: {opt.total_panels}")
    lines.append(f"Total edging: {opt.total_edging_meters} m")
    lines.append(f"Total cuts: {opt.total_cuts}")
    lines.append(f"Waste: {opt.total_waste_percent:.1f}%")
    lines.append("")

    lines.append("=== BOQ: PANEL ITEMS ===")
    for item in boq.items:
        lines.append(
            f"{item.item_no}. {item.description} | {item.size} | "
            f"Qty: {item.quantity} {item.unit} | Edges: {item.edges}"
        )
    lines.append("")

    m = boq.materials or {}
    s = boq.services or {}
    lines.append("=== MATERIALS ===")
    lines.append(f"Board type: {m.get('board_type', '-')}")
    lines.append(f"Company: {m.get('board_company', '-')}")
    lines.append(f"Color: {m.get('board_color', '-')}")
    lines.append(f"Board size: {m.get('board_size', '-')}")
    lines.append(f"Boards required: {m.get('boards_required', 0)}")
    lines.append("")

    lines.append("=== SERVICES ===")
    cutting = s.get("cutting", {})
    edging = s.get("edging", {})
    lines.append(
        f"Cutting: {cutting.get('boards', 0)} boards × "
        f"{cutting.get('price_per_board', 0)} = {cutting.get('total', 0)}"
    )
    lines.append(
        f"Edging: {edging.get('meters', 0)} m × "
        f"{edging.get('price_per_meter', 0)} = {edging.get('total', 0)}"
    )
    lines.append("")

    layouts = getattr(res, "layouts", None) or []
    lines.append("=== LAYOUT / 2D SUMMARY ===")
    if not layouts:
        lines.append("No layout data available.")
    else:
        for i, board in enumerate(layouts, 1):
            bw = board.get("board_width")
            bl = board.get("board_length")
            panels = board.get("panels") or []
            waste_area = board.get("waste_area_mm2")
            used_area = board.get("used_area_mm2")
            lines.append(
                f"Board {i}: {bw}×{bl} mm | Panels: {len(panels)} | "
                f"Used area: {used_area} mm² | Waste area: {waste_area} mm²"
            )
    lines.append("")

    if layouts:
        try:
            lines.append("=== RAW LAYOUT JSON (copy into tool if needed) ===")
            raw_json = json.dumps(layouts, indent=2, default=str)
            if len(raw_json) > 12000:
                raw_json = raw_json[:12000] + "\n... (truncated) ..."
            lines.append(raw_json)
            lines.append("")
        except Exception:
            pass

    return "\n".join(lines)


def send_invoice_for_order(order_id: str):
    order = ORDER_STORE.get_order(order_id)
    if not order:
        logger.error("send_invoice_for_order: order %s not found", order_id)
        return

    customer_text = _build_invoice_text(order, include_receipt=False)

    if order.customer_email:
        send_email(
            order.customer_email,
            f"Invoice for order {order.id}",
            customer_text,
        )

    if order.customer_phone:
        send_whatsapp_template(
            order.customer_phone,
            WHATSAPP_TEMPLATE_INVOICE,
            [
                order.customer_name or "",
                order.id,
                f"{order.amount} {order.currency}",
            ],
        )

    factory_email = COMPANY_INFO.get("email")
    if factory_email:
        factory_body = _build_factory_email_body(order, include_receipt=False)
        send_email(
            factory_email,
            f"New cutting order created {order.id}",
            factory_body,
        )

    factory_whatsapp = COMPANY_INFO.get("whatsapp")
    if factory_whatsapp:
        if WHATSAPP_TEMPLATE_FACTORY_ORDER:
            if FACTORY_ORDER_URL_BASE:
                detail_url = FACTORY_ORDER_URL_BASE.rstrip("/") + f"/{order.id}"
            else:
                detail_url = f"Order ID: {order.id}"
            send_whatsapp_template(
                factory_whatsapp,
                WHATSAPP_TEMPLATE_FACTORY_ORDER,
                [
                    order.id,
                    getattr(order.request, "project_name", "") or "",
                    order.customer_name or "",
                    order.customer_phone or "",
                    order.customer_email or "",
                    f"{order.amount} {order.currency}",
                    detail_url,
                ],
            )
        else:
            send_whatsapp_template(
                factory_whatsapp,
                WHATSAPP_TEMPLATE_INVOICE,
                [
                    COMPANY_INFO.get("name", "Factory"),
                    order.id,
                    f"{order.amount} {order.currency}",
                ],
            )


def send_notifications_for_order(order_id: str):
    order = ORDER_STORE.get_order(order_id)
    if not order:
        logger.error("send_notifications_for_order: order %s not found", order_id)
        return

    customer_text = _build_invoice_text(order, include_receipt=True)

    if order.customer_email:
        send_email(
            order.customer_email,
            f"Payment received for order {order.id}",
            customer_text,
        )

    if order.customer_phone:
        send_whatsapp_template(
            order.customer_phone,
            WHATSAPP_TEMPLATE_PAYMENT,
            [
                order.customer_name or "",
                order.id,
                f"{order.amount} {order.currency}",
                order.mpesa_receipt or "",
            ],
        )

    factory_email = COMPANY_INFO.get("email")
    if factory_email:
        factory_body = _build_factory_email_body(order, include_receipt=True)
        send_email(
            factory_email,
            f"Order {order.id} PAID",
            factory_body,
        )

    factory_whatsapp = COMPANY_INFO.get("whatsapp")
    if factory_whatsapp:
        if WHATSAPP_TEMPLATE_FACTORY_ORDER:
            if FACTORY_ORDER_URL_BASE:
                detail_url = FACTORY_ORDER_URL_BASE.rstrip("/") + f"/{order.id}"
            else:
                detail_url = f"Order ID: {order.id}"
            send_whatsapp_template(
                factory_whatsapp,
                WHATSAPP_TEMPLATE_FACTORY_ORDER,
                [
                    order.id,
                    getattr(order.request, "project_name", "") or "",
                    order.customer_name or "",
                    order.customer_phone or "",
                    order.customer_email or "",
                    f"{order.amount} {order.currency}",
                    detail_url,
                ],
            )
        else:
            send_whatsapp_template(
                factory_whatsapp,
                WHATSAPP_TEMPLATE_PAYMENT,
                [
                    COMPANY_INFO.get("name", "Factory"),
                    order.id,
                    f"{order.amount} {order.currency}",
                    order.mpesa_receipt or "",
                ],
            )


# ---------- Manual notification trigger after payment (used by frontend) ----------

class AfterPaymentNotify(BaseModel):
    order_id: str
    project_name: Optional[str] = None
    customer_name: Optional[str] = None
    customer_email: Optional[str] = None
    customer_phone: Optional[str] = None


@app.post("/api/notify/after-payment", tags=["Notifications"])
def notify_after_payment(payload: AfterPaymentNotify, background_tasks: BackgroundTasks):
    """
    Called from the frontend after payment is confirmed and the UI
    unlocks the layout. Updates the order contact details and
    sends email + WhatsApp notifications to customer and factory.
    """
    order = ORDER_STORE.get_order(payload.order_id)
    if not order:
        raise HTTPException(status_code=404, detail=f"Order {payload.order_id} not found")

    if getattr(order, "status", "") != "paid":
        logger.warning(
            "notify_after_payment called for unpaid order %s (status=%s)",
            order.id,
            getattr(order, "status", None),
        )
        raise HTTPException(status_code=400, detail="Order is not marked as paid yet")

    # Update customer/project details from latest form data
    if payload.customer_name:
        order.customer_name = payload.customer_name
    if payload.customer_email:
        order.customer_email = payload.customer_email
    if payload.customer_phone:
        order.customer_phone = payload.customer_phone
    if payload.project_name:
        try:
            order.request.project_name = payload.project_name
            order.result.boq.project_name = payload.project_name
        except Exception:
            pass

    background_tasks.add_task(send_notifications_for_order, order.id)

    return {"status": "ok", "message": "Notifications scheduled"}