# app/orders.py
from dataclasses import dataclass, field
from typing import Dict, Optional
from datetime import datetime

from app.schemas import CuttingRequest, CuttingResponse


@dataclass
class Order:
    id: str
    request: CuttingRequest
    result: CuttingResponse
    amount: float
    currency: str
    customer_name: Optional[str]
    customer_email: Optional[str]
    customer_phone: Optional[str]

    # payment state
    status: str = "pending"  # pending, paid, failed
    mpesa_receipt: Optional[str] = None

    # optional extra Mpesa metadata
    mpesa_phone: Optional[str] = None
    mpesa_amount: Optional[float] = None
    mpesa_txn_date: Optional[datetime] = None

    # status info
    status_reason: Optional[str] = None

    created_at: datetime = field(default_factory=datetime.utcnow)
    updated_at: datetime = field(default_factory=datetime.utcnow)


class OrderStore:
    def __init__(self):
        self._orders: Dict[str, Order] = {}

    def create_order(self, order: Order):
        self._orders[order.id] = order

    def get_order(self, order_id: str) -> Optional[Order]:
        return self._orders.get(order_id)

    def mark_paid(
        self,
        order_id: str,
        receipt: str,
        amount: Optional[float] = None,
        phone: Optional[str] = None,
        txn_date: Optional[datetime] = None,
    ):
        """
        Mark an order as paid and optionally store Mpesa metadata.
        Your current main.py calls this as mark_paid(order_id, receipt),
        which still works because other params are optional.
        """
        o = self._orders.get(order_id)
        if not o:
            return

        o.status = "paid"
        o.mpesa_receipt = receipt

        if amount is not None:
            o.mpesa_amount = amount
        if phone is not None:
            o.mpesa_phone = phone
        if txn_date is not None:
            o.mpesa_txn_date = txn_date

        o.status_reason = None
        o.updated_at = datetime.utcnow()

    def mark_failed(self, order_id: str, reason: Optional[str] = None):
        """
        Mark an order as failed (e.g. Mpesa declined).
        """
        o = self._orders.get(order_id)
        if not o:
            return

        o.status = "failed"
        o.status_reason = reason
        o.updated_at = datetime.utcnow()

    def set_status(self, order_id: str, status: str, reason: Optional[str] = None):
        """
        Generic status setter if you need custom statuses.
        """
        o = self._orders.get(order_id)
        if not o:
            return

        o.status = status
        o.status_reason = reason
        o.updated_at = datetime.utcnow()


ORDER_STORE = OrderStore()