"""Bill of Quantities generator."""

from datetime import datetime
from typing import List
from app.schemas import (
    CuttingRequest, OptimizationSummary, PricingSummary,
    BOQItem, BOQSummary, EdgingDetail, EdgingSummary
)
from app.config import (
    BOARD_TYPES, CUTTING_PRICE_PER_BOARD, EDGING_PRICE_PER_METER,
    DEFAULT_BOARD_WIDTH_MM, DEFAULT_BOARD_LENGTH_MM, CURRENCY
)


def generate_edging_summary(request: CuttingRequest) -> EdgingSummary:
    """Generate detailed edging summary."""
    details: List[EdgingDetail] = []
    total_meters = 0
    
    for idx, panel in enumerate(request.panels):
        edge_per_panel = panel.edge_length_mm / 1000  # Convert to meters
        total_edge = panel.total_edge_length_m
        total_meters += total_edge
        
        if edge_per_panel > 0:
            details.append(EdgingDetail(
                panel_label=panel.label or f"Panel {idx + 1}",
                quantity=panel.quantity,
                edge_per_panel_m=round(edge_per_panel, 3),
                total_edge_m=round(total_edge, 2),
                edges_applied=panel.edging.to_string()
            ))
    
    return EdgingSummary(
        total_meters=round(total_meters, 2),
        details=details
    )


def generate_boq(
    request: CuttingRequest,
    summary: OptimizationSummary,
    pricing: PricingSummary
) -> BOQSummary:
    """
    Generate Bill of Quantities.
    
    Includes:
    - Panel items with sizes and quantities
    - Material requirements
    - Service requirements
    - Complete pricing with tax
    """
    items: List[BOQItem] = []
    
    # Add panel items
    for idx, panel in enumerate(request.panels):
        items.append(BOQItem(
            item_no=idx + 1,
            description=panel.label or f"Panel {idx + 1}",
            size=f"{int(panel.width)} x {int(panel.length)} mm",
            quantity=panel.quantity,
            unit="pcs",
            edges=panel.edging.to_string()
        ))
    
    # Materials summary
    board_type = request.board.board_type.value
    board_info = BOARD_TYPES.get(board_type, {})
    
    materials = {
        "board_type": board_type,
        "board_color": request.board.color,
        "board_size": f"{DEFAULT_BOARD_WIDTH_MM} x {DEFAULT_BOARD_LENGTH_MM} mm",
        "boards_required": summary.total_boards,
        "board_price": board_info.get("price", 0),
        "supplied_by": pricing.supplied_by
    }
    
    # Services summary
    services = {
        "cutting": {
            "boards": summary.total_boards,
            "price_per_board": CUTTING_PRICE_PER_BOARD,
            "total": summary.total_boards * CUTTING_PRICE_PER_BOARD
        },
        "edging": {
            "meters": summary.total_edging_meters,
            "price_per_meter": EDGING_PRICE_PER_METER,
            "total": round(summary.total_edging_meters * EDGING_PRICE_PER_METER, 2)
        }
    }
    
    return BOQSummary(
        project_name=request.project_name,
        customer_name=request.customer_name,
        date=datetime.now().strftime("%Y-%m-%d"),
        items=items,
        materials=materials,
        services=services,
        pricing=pricing
    )