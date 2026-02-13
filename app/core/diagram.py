"""SVG diagram generator for cutting layouts."""

from typing import List
from app.schemas import BoardLayout
from app.config import DEFAULT_BOARD_WIDTH_MM, DEFAULT_BOARD_LENGTH_MM


# Color palette for panels
PANEL_COLORS = [
    "#4CAF50", "#2196F3", "#FF9800", "#9C27B0", "#F44336",
    "#00BCD4", "#8BC34A", "#FF5722", "#673AB7", "#3F51B5",
    "#009688", "#FFC107", "#E91E63", "#795548", "#607D8B"
]


def generate_board_svg(
    layout: BoardLayout,
    board_width: float = DEFAULT_BOARD_WIDTH_MM,
    board_length: float = DEFAULT_BOARD_LENGTH_MM,
    scale: float = 0.25
) -> str:
    """
    Generate SVG diagram for a single board layout.
    
    Args:
        layout: Board layout with placed panels
        board_width: Board width in mm
        board_length: Board length in mm
        scale: Scale factor for display
    
    Returns:
        SVG string
    """
    # Scaled dimensions
    svg_width = board_width * scale
    svg_height = board_length * scale
    margin = 20
    
    total_width = svg_width + margin * 2
    total_height = svg_height + margin * 2 + 60  # Extra for title and legend
    
    svg_parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {total_width} {total_height}" ',
        f'width="{total_width}" height="{total_height}">',
        
        # Background
        '<rect width="100%" height="100%" fill="#f5f5f5"/>',
        
        # Title
        f'<text x="{total_width/2}" y="20" text-anchor="middle" font-family="Arial" font-size="14" font-weight="bold">',
        f'Board {layout.board_number} - Efficiency: {layout.efficiency_percent:.1f}%</text>',
        
        # Board outline
        f'<rect x="{margin}" y="35" width="{svg_width}" height="{svg_height}" ',
        'fill="#fff8e1" stroke="#333" stroke-width="2"/>',
        
        # Board dimensions
        f'<text x="{margin + svg_width/2}" y="{35 + svg_height + 15}" text-anchor="middle" font-family="Arial" font-size="10">',
        f'{int(board_width)} mm</text>',
        f'<text x="{margin - 10}" y="{35 + svg_height/2}" text-anchor="middle" font-family="Arial" font-size="10" transform="rotate(-90, {margin - 10}, {35 + svg_height/2})">',
        f'{int(board_length)} mm</text>',
    ]
    
    # Draw panels
    for panel in layout.panels:
        color = PANEL_COLORS[panel.panel_index % len(PANEL_COLORS)]
        x = margin + panel.x * scale
        y = 35 + panel.y * scale
        w = panel.width * scale
        h = panel.length * scale
        
        # Panel rectangle
        svg_parts.append(
            f'<rect x="{x}" y="{y}" width="{w}" height="{h}" '
            f'fill="{color}" fill-opacity="0.7" stroke="#333" stroke-width="1"/>'
        )
        
        # Panel label
        label = panel.label or f"P{panel.panel_index + 1}"
        font_size = min(10, min(w, h) / 3)
        if font_size >= 6:
            svg_parts.append(
                f'<text x="{x + w/2}" y="{y + h/2}" text-anchor="middle" '
                f'dominant-baseline="middle" font-family="Arial" font-size="{font_size}" fill="#000">'
                f'{label}</text>'
            )
        
        # Dimensions
        if w > 40 and h > 30:
            svg_parts.append(
                f'<text x="{x + w/2}" y="{y + h/2 + font_size + 2}" text-anchor="middle" '
                f'font-family="Arial" font-size="7" fill="#666">'
                f'{int(panel.width)}x{int(panel.length)}</text>'
            )
    
    # Panel count
    svg_parts.append(
        f'<text x="{total_width - margin}" y="{total_height - 10}" text-anchor="end" '
        f'font-family="Arial" font-size="10" fill="#666">'
        f'Panels: {layout.panel_count}</text>'
    )
    
    svg_parts.append('</svg>')
    
    return '\n'.join(svg_parts)


def generate_all_diagrams(layouts: List[BoardLayout]) -> List[str]:
    """Generate SVG diagrams for all boards."""
    return [generate_board_svg(layout) for layout in layouts]