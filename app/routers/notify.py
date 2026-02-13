from fastapi import APIRouter, BackgroundTasks
from pydantic import BaseModel, EmailStr
from typing import Optional

router = APIRouter()

class AfterPaymentNotify(BaseModel):
    order_id: str
    project_name: Optional[str] = None
    customer_name: str
    customer_email: EmailStr
    customer_phone: str  # WhatsApp / phone

@router.post("/api/notify/after-payment")
async def notify_after_payment(payload: AfterPaymentNotify,
                               background_tasks: BackgroundTasks):
    # TODO: load order + BOQ from DB using payload.order_id

    background_tasks.add_task(send_invoice_email_to_customer, payload)
    background_tasks.add_task(send_invoice_email_to_company, payload)
    background_tasks.add_task(send_whatsapp_messages, payload)

    return {"status": "ok", "message": "Notifications scheduled"}

def send_invoice_email_to_customer(payload: AfterPaymentNotify):
    # integrate your email provider here
    ...

def send_invoice_email_to_company(payload: AfterPaymentNotify):
    ...

def send_whatsapp_messages(payload: AfterPaymentNotify):
    # integrate WhatsApp API (Twilio / Meta Cloud API)
    ...