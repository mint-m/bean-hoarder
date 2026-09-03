// 향미 노트 입력 — 문자열을 치는 대신 노트를 고른다.
//
// 예전에는 콤마로 구분한 자유 텍스트 한 칸이었다. 그래서 (1) 같은 향미가 카드마다 다르게 적히고
// (Honey Peach / honey peach), (2) 콤마를 직접 관리해야 하고, (3) 지우려면 문장 가운데를 편집해야
// 했다. 여기서는 고른 노트가 지울 수 있는 블록이 되고, 콤마는 저장 형식으로만 남는다.
//
// **저장값은 영문**이다(@bnhd/schema/flavor). 한글은 검색을 돕는 보조어일 뿐 — 이 값이 인쇄 라벨에
// 그대로 찍히고 조회 카드의 색을 정한다. 목록에 없는 향미는 친 그대로 들어간다(막지 않는다).
import { type FlavorNote, parseNotes, searchNotes, serializeNotes } from "@bnhd/schema/flavor";
import { useId, useRef, useState } from "react";
import { capitalizeNoteSegments } from "../lib/format";

const MENU_MAX = 8;

export default function FlavorPicker({
  value,
  onChange,
}: {
  /** 저장 형식 그대로의 콤마 목록 — AI 채움·CSV 복원분이 그대로 들어온다 */
  value: string;
  onChange: (next: string) => void;
}) {
  const tokens = parseNotes(value);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const menuId = useId();

  const has = (v: string) => tokens.some((t) => t.toLowerCase() === v.toLowerCase());
  // 이미 고른 것은 후보에서 뺀다 — 눌러도 아무 일이 없는 줄이 남으면 목록을 못 믿게 된다
  const results: FlavorNote[] = open ? searchNotes(query, MENU_MAX).filter((n) => !has(n.en)) : [];
  const typed = capitalizeNoteSegments(query.trim());
  /**
   * 목록에 없는 향미 — 친 그대로 담는 탈출구.
   *
   * **후보가 하나도 없을 때만** 연다. 후보가 있는데 이 줄이 함께 뜨면 방금 친 검색어가 값처럼
   * 보여서, "자스민"을 치고 Jasmine 대신 "자스민"을 담게 된다 — 저장은 영문이라는 규칙이
   * 실수 한 번으로 깨진다. 목록에 없을 때는 견줄 대상 자체가 없어 그 위험이 없다.
   */
  const showNew = open && !!typed && !results.length && !has(typed);

  function add(v: string) {
    if (v && !has(v)) onChange(serializeNotes([...tokens, v]));
    setQuery("");
    setActive(0);
    inputRef.current?.focus();
  }
  function remove(v: string) {
    onChange(serializeNotes(tokens.filter((t) => t !== v)));
  }
  /** 지금 강조된 줄을 담는다. 후보가 없으면 친 값 그대로. */
  function commit() {
    const picked = results[active];
    if (picked) add(picked.en);
    else if (typed) add(typed);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    const rows = results.length + (showNew ? 1 : 0);
    if (e.key === "Enter") {
      e.preventDefault(); // 폼 제출을 막는다 — 여기서 Enter는 "담기"다
      commit();
    } else if (e.key === ",") {
      // 콤마를 칠 필요는 없지만, 쳤다면 "이 항목 끝"이라는 뜻이다
      e.preventDefault();
      commit();
    } else if (e.key === "ArrowDown" && rows) {
      e.preventDefault();
      setActive((i) => (i + 1) % rows);
    } else if (e.key === "ArrowUp" && rows) {
      e.preventDefault();
      setActive((i) => (i - 1 + rows) % rows);
    } else if (e.key === "Escape") {
      setOpen(false);
    } else if (e.key === "Backspace" && !query && tokens.length) {
      // 빈 칸에서의 백스페이스는 "직전 것 취소" — 칩을 마우스로 찾아가지 않아도 되게
      remove(tokens[tokens.length - 1] as string);
    }
  }

  return (
    <div className="notepick">
      {tokens.length > 0 && (
        <ul className="note-tokens">
          {tokens.map((t) => (
            <li key={t} className="note-token">
              {t}
              <button type="button" aria-label={`${t} 빼기`} onClick={() => remove(t)}>
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="notepick-field">
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          autoComplete="off"
          aria-label="향미 검색"
          aria-expanded={open}
          aria-controls={menuId}
          aria-autocomplete="list"
          placeholder="향미를 검색하세요 — peach, 황도, 자스민…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          // 후보를 마우스로 누를 때 blur가 먼저 닿지 않도록 옵션 쪽에서 mousedown을 막는다
          onBlur={() => setOpen(false)}
          onKeyDown={onKeyDown}
        />
        {open && (results.length > 0 || showNew) && (
          <div className="notepick-menu" id={menuId} role="listbox">
            {results.map((n, i) => (
              <button
                key={n.en}
                type="button"
                role="option"
                aria-selected={i === active}
                className={`notepick-opt${i === active ? " on" : ""}`}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setActive(i)}
                onClick={() => add(n.en)}
              >
                {n.en}
                <span className="notepick-ko">{n.ko}</span>
              </button>
            ))}
            {showNew && (
              <button
                type="button"
                role="option"
                aria-selected={active === results.length}
                className={`notepick-opt notepick-new${active === results.length ? " on" : ""}`}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setActive(results.length)}
                onClick={() => add(typed)}
              >
                {typed}
                <span className="notepick-ko">목록에 없음 — 그대로 담기</span>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
