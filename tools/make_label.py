# -*- coding: utf-8 -*-
"""
40x20mm 원두 소분 라벨 생성기.

CSV(구글시트 내보내기)에서 KEY로 행을 찾아 라벨 SVG + 320dpi PNG를 생성하고,
생성된 PNG의 QR을 실제로 디코드해서 검증한다.

사용법:
  py tools/make_label.py --key VEHUH26-001          # 한 장
  py tools/make_label.py --all                       # CSV 전체 배치
  py tools/make_label.py --key ... --csv path.csv --outdir labels
"""
import argparse
import csv
import io
import re
import sys
from pathlib import Path

import segno

# ---- 설정 ---------------------------------------------------------------
BASE_URL = "HTTPS://CUPCODE.PAGES.DEV"  # 대문자 유지: QR 알파뉴메릭 모드 → 25x25 유지
DPI = 320

# ---- 라벨 지오메트리 (mm) -------------------------------------------------
W, H = 40.0, 20.0
MARGIN = 1.8
QR_SIZE = 8.0
QR_X = W - 1.4 - QR_SIZE          # 30.6
QR_Y = 9.2                        # 하단 여백에 코드 텍스트 공간 확보
QUIET = 1.3                       # 콰이엇존(≈4모듈), 좌측 텍스트가 침범하지 않는 경계
LEFT_MAX = QR_X - QUIET - MARGIN  # QR 옆 텍스트 최대 폭
FULL_MAX = W - MARGIN * 2         # QR 위쪽 전폭 텍스트 최대 폭

SANS = "Arial, Helvetica, sans-serif"
MONO = "Consolas, 'Courier New', monospace"

KEY_RE = re.compile(r"^[A-Z0-9]{5}\d{2}-\d{3}$")


def esc(s: str) -> str:
    return (s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
             .replace('"', "&quot;"))


def est_width(text: str, size: float, factor: float) -> float:
    return len(text) * size * factor


def text_el(x, y, text, size, *, factor, max_w, font=SANS, weight=None,
            style=None, spacing=None, anchor=None):
    """textLength로 폭을 고정한 <text> 요소. 프린터 드라이버의 폰트 치환에도 넘침 방지."""
    if not text:
        return ""
    w = min(est_width(text, size, factor), max_w)
    attrs = [
        f'x="{x:.2f}" y="{y:.2f}"',
        f'font-family="{font}" font-size="{size}"',
        f'textLength="{w:.2f}" lengthAdjust="spacingAndGlyphs"',
    ]
    if weight:
        attrs.append(f'font-weight="{weight}"')
    if style:
        attrs.append(f'font-style="{style}"')
    if spacing is not None:
        attrs.append(f'letter-spacing="{spacing}"')
    if anchor:
        attrs.append(f'text-anchor="{anchor}"')
    return f'<text {" ".join(attrs)}>{esc(text)}</text>'


def qr_path(key: str) -> tuple[str, str, int]:
    """QR을 단일 <path>로. (path_d, 인코딩된 내용, 모듈 수) 반환."""
    content = f"{BASE_URL}/{key}"
    q = segno.make(content, error="m", boost_error=False)
    if q.mode != "alphanumeric":
        raise SystemExit(f"QR이 알파뉴메릭 모드가 아님({q.mode}). BASE_URL/KEY에 소문자·특수문자 확인.")
    matrix = list(q.matrix)
    n = len(matrix)
    module = QR_SIZE / n
    parts = []
    for r, row in enumerate(matrix):
        c = 0
        while c < n:
            if row[c]:
                run = 1
                while c + run < n and row[c + run]:
                    run += 1
                x = QR_X + c * module
                y = QR_Y + r * module
                parts.append(f"M{x:.3f} {y:.3f}h{run * module:.3f}v{module:.3f}h{-run * module:.3f}z")
                c += run
            else:
                c += 1
    return "".join(parts), content, n


def build_svg(row: dict) -> tuple[str, str]:
    key = row["KEY"].strip().upper()
    if not KEY_RE.match(key):
        raise SystemExit(f"KEY 형식 오류: {key} (예: VEHUH26-001)")

    g = lambda k: (row.get(k) or "").strip()
    els = []

    # 1. 로스터리 (eyebrow)
    els.append(text_el(MARGIN, 3.0, g("ROASTERY").upper(), 1.5,
                       factor=0.70, max_w=FULL_MAX, weight="bold", spacing=0.12))
    # 2. 원산지 (헤드라인)
    els.append(text_el(MARGIN, 6.2, g("ORIGIN").upper(), 3.0,
                       factor=0.68, max_w=FULL_MAX, weight="bold"))
    # 3. 품종 · 가공방식
    sub = " · ".join(x for x in (g("VARIETY"), g("PROCESS")) if x)
    els.append(text_el(MARGIN, 8.3, sub, 1.6, factor=0.52, max_w=FULL_MAX))
    # 구분선
    els.append(f'<line x1="{MARGIN}" y1="9.3" x2="{MARGIN + LEFT_MAX:.2f}" y2="9.3" '
               f'stroke="#000" stroke-width="0.12"/>')
    # 4. 스펙 그리드 (모노스페이스, 2열 x 3행)
    specs = [("ALT", g("ALTITUDE")), ("HARV", g("HARVEST")),
             ("RSTD", g("ROAST_DATE")), ("PKGD", g("PACKAGE_DATE")),
             ("NET", g("NET_WEIGHT")), ("AGT", g("AGTRON"))]
    col_x = (MARGIN, MARGIN + 14.0)
    cell_max = 12.6
    for i, (label, val) in enumerate(specs):
        if not val:
            continue
        x = col_x[i % 2]
        y = 11.3 + (i // 2) * 2.15
        els.append(text_el(x, y, f"{label} {val}", 1.45,
                           factor=0.55, max_w=cell_max, font=MONO))
    # 5. 테이스팅 노트
    els.append(text_el(MARGIN, 18.6, g("TASTING_NOTE"), 1.5,
                       factor=0.50, max_w=LEFT_MAX, style="italic"))
    # 6. QR + 코드 병기
    d, content, n = qr_path(key)
    els.append(f'<path d="{d}" fill="#000"/>')
    els.append(text_el(QR_X + QR_SIZE / 2, 18.9, key, 1.2,
                       factor=0.55, max_w=QR_SIZE + 1.5, font=MONO, anchor="middle"))

    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}mm" height="{H}mm" '
           f'viewBox="0 0 {W} {H}">\n'
           f'<rect width="{W}" height="{H}" fill="#fff"/>\n'
           + "\n".join(e for e in els if e) + "\n</svg>\n")
    return svg, content


def render_png(svg: str, out_png: Path):
    import resvg_py
    px_w = round(W / 25.4 * DPI)  # 40mm @320dpi = 504px
    data = resvg_py.svg_to_bytes(svg_string=svg, width=px_w, dpi=DPI,
                                 background="#ffffff")
    out_png.write_bytes(bytes(data))


def verify_qr(png_path: Path, expected: str) -> bool:
    import zxingcpp
    from PIL import Image
    results = zxingcpp.read_barcodes(Image.open(png_path))
    got = [r.text for r in results]
    ok = expected in got
    print(f"  QR 디코드: {'OK' if ok else 'FAIL'} {got}")
    return ok


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--csv", default="bean_sheet_template.csv")
    ap.add_argument("--key", help="생성할 KEY (예: VEHUH26-001)")
    ap.add_argument("--all", action="store_true", help="CSV의 모든 행 배치 생성")
    ap.add_argument("--outdir", default="labels")
    args = ap.parse_args()

    root = Path(__file__).resolve().parent.parent
    csv_path = Path(args.csv) if Path(args.csv).is_absolute() else root / args.csv
    outdir = Path(args.outdir) if Path(args.outdir).is_absolute() else root / args.outdir
    outdir.mkdir(parents=True, exist_ok=True)

    with open(csv_path, encoding="utf-8-sig") as f:
        rows = [r for r in csv.DictReader(f) if (r.get("KEY") or "").strip()]

    if args.all:
        targets = rows
    elif args.key:
        targets = [r for r in rows if r["KEY"].strip().upper() == args.key.upper()]
        if not targets:
            raise SystemExit(f"CSV에 KEY {args.key} 없음")
    else:
        raise SystemExit("--key 또는 --all 필요")

    failed = 0
    for row in targets:
        key = row["KEY"].strip().upper()
        svg, content = build_svg(row)
        svg_path = outdir / f"{key}.svg"
        png_path = outdir / f"{key}_{DPI}dpi.png"
        svg_path.write_text(svg, encoding="utf-8")
        render_png(svg, png_path)
        print(f"{key}: {svg_path.name}, {png_path.name}  ({content})")
        if not verify_qr(png_path, content):
            failed += 1
    if failed:
        raise SystemExit(f"{failed}건 QR 검증 실패")
    print(f"완료: {len(targets)}장 생성, QR 전수 검증 통과")


if __name__ == "__main__":
    main()
