"""Simple 2D bin packing / panel optimizer with basic cut segments."""

from typing import List, Tuple

from app.schemas import (
    CuttingRequest,
    PanelDetail,
    BoardLayout,
    PlacedPanel,
    OptimizationSummary,
    CutSegment,
)
from app.config import DEFAULT_BOARD_WIDTH_MM, DEFAULT_BOARD_LENGTH_MM, DEFAULT_KERF_MM


class PanelOptimizer:
    def __init__(
        self,
        board_width: float = DEFAULT_BOARD_WIDTH_MM,
        board_length: float = DEFAULT_BOARD_LENGTH_MM,
        kerf: float = DEFAULT_KERF_MM,
    ) -> None:
        self.board_width = board_width
        self.board_length = board_length
        self.kerf = kerf
        self.board_area = board_width * board_length

    def optimize(
        self, request: CuttingRequest
    ) -> Tuple[List[BoardLayout], OptimizationSummary]:
        expanded = self._expand_panels(request.panels)
        expanded.sort(key=lambda p: p["area"], reverse=True)

        boards: List[BoardLayout] = []

        for panel in expanded:
            placed = False
            for board in boards:
                pos = self._find_position(board, panel)
                if pos:
                    x, y = pos
                    self._place_panel(board, panel, x, y)
                    placed = True
                    break

            if not placed:
                board = self._create_new_board(panel, len(boards) + 1)
                boards.append(board)

        # compute cut segments per board
        for b in boards:
            self._compute_cuts_for_board(b)

        # global stats
        total_panels = sum(p.quantity for p in request.panels)
        unique_panels = len(request.panels)
        total_used = sum(b.used_area_mm2 for b in boards)
        total_waste = sum(b.waste_area_mm2 for b in boards)
        total_board_area = len(boards) * self.board_area

        total_cuts = sum(len(b.cuts) for b in boards)
        total_cut_length = sum(sum(c.length for c in b.cuts) for b in boards)

        summary = OptimizationSummary(
            total_boards=len(boards),
            total_panels=total_panels,
            unique_panel_types=unique_panels,
            total_edging_meters=0.0,  # filled later
            total_cuts=total_cuts,
            total_cut_length=total_cut_length,
            total_waste_mm2=total_waste,
            total_waste_percent=(
                (total_waste / total_board_area * 100) if total_board_area else 0
            ),
            board_width=self.board_width,
            board_length=self.board_length,
        )

        return boards, summary

    # ---------- helpers ----------

    def _expand_panels(self, panels: List[PanelDetail]) -> List[dict]:
        expanded = []
        for idx, p in enumerate(panels):
            for _ in range(p.quantity):
                expanded.append(
                    {
                        "panel_index": idx,
                        "width": p.width,
                        "length": p.length,
                        "area": p.width * p.length,
                        "label": p.label or f"Panel {idx + 1}",
                    }
                )
        return expanded

    def _create_new_board(self, panel: dict, number: int) -> BoardLayout:
        x = 0.0
        y = 0.0
        placed = PlacedPanel(
            panel_index=panel["panel_index"],
            x=x,
            y=y,
            width=panel["width"],
            length=panel["length"],
            label=panel["label"],
        )

        used_area = panel["area"]
        waste_area = self.board_area - used_area
        eff = used_area / self.board_area * 100 if self.board_area else 0

        return BoardLayout(
            board_number=number,
            board_width=self.board_width,
            board_length=self.board_length,
            used_area_mm2=used_area,
            waste_area_mm2=waste_area,
            efficiency_percent=eff,
            panel_count=1,
            panels=[placed],
            cuts=[],
        )

    def _find_position(self, board: BoardLayout, panel: dict):
        step = 10  # mm grid

        for y in range(0, int(self.board_length - panel["length"]) + 1, step):
            for x in range(0, int(self.board_width - panel["width"]) + 1, step):
                if self._can_place(board, x, y, panel["width"], panel["length"]):
                    return float(x), float(y)
        return None

    def _can_place(
        self, board: BoardLayout, x: float, y: float, w: float, l: float
    ) -> bool:
        if x + w > self.board_width or y + l > self.board_length:
            return False

        for p in board.panels:
            if not (
                x + w + self.kerf <= p.x
                or p.x + p.width + self.kerf <= x
                or y + l + self.kerf <= p.y
                or p.y + p.length + self.kerf <= y
            ):
                return False
        return True

    def _place_panel(
        self, board: BoardLayout, panel: dict, x: float, y: float
    ) -> None:
        placed = PlacedPanel(
            panel_index=panel["panel_index"],
            x=x,
            y=y,
            width=panel["width"],
            length=panel["length"],
            label=panel["label"],
        )
        board.panels.append(placed)
        board.panel_count += 1
        board.used_area_mm2 += panel["area"]
        board.waste_area_mm2 = self.board_area - board.used_area_mm2
        board.efficiency_percent = (
            board.used_area_mm2 / self.board_area * 100 if self.board_area else 0
        )

    def _compute_cuts_for_board(self, board: BoardLayout) -> None:
        """
        Derive simple guillotine cuts from panel edges:
        - vertical cuts at every unique panel x-edge
        - horizontal cuts at every unique panel y-edge
        Cuts span the full board width / length.
        """
        xs = set()
        ys = set()
        for p in board.panels:
            xs.add(p.x)
            xs.add(p.x + p.width)
            ys.add(p.y)
            ys.add(p.y + p.length)

        xs = sorted(xs)
        ys = sorted(ys)
        cuts: list[CutSegment] = []
        cid = 1

        # vertical cuts (ignore boundaries)
        for x in xs:
            if 0 < x < self.board_width:
                cuts.append(
                    CutSegment(
                        id=cid,
                        orientation="V",
                        x1=x,
                        y1=0,
                        x2=x,
                        y2=self.board_length,
                        length=self.board_length,
                    )
                )
                cid += 1

        # horizontal cuts
        for y in ys:
            if 0 < y < self.board_length:
                cuts.append(
                    CutSegment(
                        id=cid,
                        orientation="H",
                        x1=0,
                        y1=y,
                        x2=self.board_width,
                        y2=y,
                        length=self.board_width,
                    )
                )
                cid += 1

        board.cuts = cuts


def optimize_cutting(
    request: CuttingRequest,
) -> Tuple[List[BoardLayout], OptimizationSummary]:
    optimizer = PanelOptimizer()
    return optimizer.optimize(request)