from __future__ import annotations

from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
SKILLS_DIR = ROOT / ".agents" / "skills"
INDEX_PATH = SKILLS_DIR / "SKILLS_INDEX.md"


def _read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def _frontmatter(path: Path) -> dict[str, str]:
    text = _read_text(path)
    if not text.startswith("---"):
        raise ValueError(f"{path} has no YAML frontmatter")
    end = text.find("\n---", 3)
    if end == -1:
        raise ValueError(f"{path} has unterminated YAML frontmatter")
    data: dict[str, str] = {}
    current_key: str | None = None
    for raw_line in text[3:end].splitlines():
        if raw_line.startswith((" ", "\t")) and current_key:
            data[current_key] = (data[current_key] + " " + raw_line.strip()).strip()
            continue
        line = raw_line.strip()
        current_key = None
        if not line or ":" not in line:
            continue
        key, value = line.split(":", 1)
        value = value.strip().strip('"').strip("'")
        current_key = key.strip()
        data[current_key] = value
    return data


def _openai_yaml(path: Path) -> dict[str, str]:
    if not path.exists():
        return {}
    data: dict[str, str] = {}
    for raw_line in _read_text(path).splitlines():
        line = raw_line.strip()
        if not line or ":" not in line:
            continue
        key, value = line.split(":", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key in {
            "display_name",
            "short_description",
            "default_prompt",
            "allow_implicit_invocation",
        }:
            data[key] = value
    return data


def _escape_markdown_cell(value: str) -> str:
    return value.replace("\n", " ").replace("|", "\\|").strip()


def _shorten(value: str, limit: int = 140) -> str:
    value = " ".join(value.split())
    if len(value) <= limit:
        return value
    return value[: limit - 1].rstrip() + "…"


def collect_skills() -> list[dict[str, str]]:
    if not SKILLS_DIR.exists():
        return []

    skills: list[dict[str, str]] = []
    for folder in sorted(p for p in SKILLS_DIR.iterdir() if p.is_dir()):
        skill_md = folder / "SKILL.md"
        if not skill_md.exists():
            continue
        frontmatter = _frontmatter(skill_md)
        ui = _openai_yaml(folder / "agents" / "openai.yaml")
        summary = ui.get("short_description") or frontmatter.get("description", "")
        skills.append(
            {
                "folder": folder.name,
                "name": frontmatter.get("name", ""),
                "display_name": ui.get("display_name", ""),
                "summary": _shorten(summary),
                "implicit": ui.get("allow_implicit_invocation", "true"),
            }
        )
    return skills


def render_index() -> str:
    rows = collect_skills()
    lines = [
        "# Codex 스킬 목록",
        "",
        "> 이 문서는 `.agents/scripts/generate_skills_index.py`로 자동 생성됩니다. "
        "스킬을 추가, 삭제, 수정한 뒤에는 `npm run skills:sync`를 실행하세요.",
        "",
        "## 운영 규칙",
        "",
        "- 스킬의 실제 내용은 각 폴더의 `SKILL.md`를 기준으로 합니다.",
        "- 기능 개발, 기존 기능 변경, 업데이트 완료 시 AI는 `Skill Impact Check`를 수행합니다.",
        "- 스킬이 추가, 삭제, 변경되면 `SKILLS_INDEX.md`를 재생성하고 `npm run skills:check`로 검증합니다.",
        "",
        "## 설치된 스킬",
        "",
        "| 폴더 | 스킬명 | 표시명 | 기능 요약 | 자동 호출 |",
        "| --- | --- | --- | --- | --- |",
    ]
    for row in rows:
        lines.append(
            "| {folder} | {name} | {display_name} | {summary} | {implicit} |".format(
                folder=_escape_markdown_cell(row["folder"]),
                name=_escape_markdown_cell(row["name"]),
                display_name=_escape_markdown_cell(row["display_name"]),
                summary=_escape_markdown_cell(row["summary"]),
                implicit=_escape_markdown_cell(row["implicit"]),
            )
        )
    lines.append("")
    return "\n".join(lines)


def main() -> None:
    SKILLS_DIR.mkdir(parents=True, exist_ok=True)
    INDEX_PATH.write_text(render_index(), encoding="utf-8", newline="\n")
    print(f"Updated {INDEX_PATH}")


if __name__ == "__main__":
    main()
