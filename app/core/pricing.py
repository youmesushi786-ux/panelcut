from typing import List

from app.schemas import (
    CuttingRequest,
    OptimizationSummary,
    BoardSelection,
    PricingLine,
    PricingSummary,
)
from app.config import (
    BOARD_PRICE_TABLE,
    CUTTING_PRICE_PER_BOARD,
    EDGING_PRICE_PER_METER,           # factory edging price (e.g. 75 KSh/m)
    CLIENT_EDGING_PRICE_PER_METER,    # client edging price (e.g. 55 KSh/m)
    TAX_RATE,                         # decimal fraction, e.g. 0.16 for 16%
    CURRENCY,
)


def get_board_price_per_sheet(board: BoardSelection) -> float:
    core = board.core_type.value
    th = int(board.thickness_mm.value)
    company = board.company
    try:
        return float(BOARD_PRICE_TABLE[core][th][company])
    except KeyError:
        return 0.0


def calculate_pricing(
    request: CuttingRequest,
    summary: OptimizationSummary,
    total_edging_m: float,
) -> PricingSummary:
    """
    Build pricing summary from optimization, taking into account
    who supplies boards and edging.

    - Factory supply:
        * Materials charged from board price table.
        * Edging uses optimizer total_edging_m at EDGING_PRICE_PER_METER.
    - Client supply:
        * No materials.
        * Edging uses request.supply.client_edging_meters (if provided),
          otherwise falls back to optimizer total_edging_m.
        * Charged at CLIENT_EDGING_PRICE_PER_METER.
    """
    boards_required = summary.total_boards

    board_price_per_sheet = get_board_price_per_sheet(request.board)
    material_cost = 0.0
    lines: List[PricingLine] = []

    # -------- Materials --------
    if not request.supply.client_supply:
        # Factory supply: charge for boards
        material_cost = boards_required * board_price_per_sheet
        lines.append(
            PricingLine(
                item="Materials",
                description=f"{request.board.core_type.value.upper()} "
                            f"{int(request.board.thickness_mm.value)}mm "
                            f"{request.board.company} ({request.board.color_name})",
                quantity=boards_required,
                unit="sheet",
                unit_price=board_price_per_sheet,
                amount=material_cost,
            )
        )
        supplied_by = "Factory"
    else:
        supplied_by = "Client"

    # -------- Services: cutting --------
    cutting_cost = summary.total_boards * CUTTING_PRICE_PER_BOARD
    lines.append(
        PricingLine(
            item="Cutting",
            description="Board cutting service",
            quantity=summary.total_boards,
            unit="board",
            unit_price=CUTTING_PRICE_PER_BOARD,
            amount=cutting_cost,
        )
    )

    # -------- Services: edging --------
    if request.supply.client_supply:
        # Client brings edging: use client-specified meters if present
        effective_edging_m = (
            request.supply.client_edging_meters
            if request.supply.client_edging_meters is not None
            else total_edging_m
        )
        edging_rate = CLIENT_EDGING_PRICE_PER_METER
    else:
        # Factory brings edging: use optimizer total
        effective_edging_m = total_edging_m
        edging_rate = EDGING_PRICE_PER_METER

    edging_cost = effective_edging_m * edging_rate

    lines.append(
        PricingLine(
            item="Edging",
            description="Edge banding service",
            quantity=effective_edging_m,
            unit="m",
            unit_price=edging_rate,
            amount=edging_cost,
        )
    )

    # -------- Totals & tax --------
    subtotal = material_cost + cutting_cost + edging_cost
    tax_amount = subtotal * TAX_RATE
    total = subtotal + tax_amount

    return PricingSummary(
        lines=lines,
        subtotal=subtotal,
        tax_name="VAT",
        tax_rate=TAX_RATE * 100.0,  # displayed as percent
        tax_amount=tax_amount,
        total=total,
        currency=CURRENCY,
        supplied_by=supplied_by,
    )