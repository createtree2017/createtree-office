from __future__ import annotations

import re
import sys
from pathlib import Path

import generate_skills_index


ROOT = Path(__file__).resolve().parents[2]
SKILLS_DIR = ROOT / ".agents" / "skills"
INDEX_PATH = SKILLS_DIR / "SKILLS_INDEX.md"
NAME_RE = re.compile(r"^[a-z0-9-]{1,64}$")


def _failures() -> list[str]:
    failures: list[str] = []
    names: set[str] = set()

    if not SKILLS_DIR.exists():
        return [f"Missing skills directory: {SKILLS_DIR}"]

    for folder in sorted(p for p in SKILLS_DIR.iterdir() if p.is_dir()):
        skill_md = folder / "SKILL.md"
        openai_yaml = folder / "agents" / "openai.yaml"

        if not skill_md.exists():
            failures.append(f"{folder.name}: missing SKILL.md")
            continue

        try:
            frontmatter = generate_skills_index._frontmatter(skill_md)
        except Exception as exc:  # noqa: BLE001
            failures.append(f"{folder.name}: invalid SKILL.md frontmatter ({exc})")
            continue

        name = frontmatter.get("name", "")
        description = frontmatter.get("description", "")
        if not name:
            failures.append(f"{folder.name}: missing frontmatter name")
        elif not NAME_RE.match(name):
            failures.append(f"{folder.name}: invalid skill name '{name}'")
        elif name in names:
            failures.append(f"{folder.name}: duplicate skill name '{name}'")
        else:
            names.add(name)

        if not description:
            failures.append(f"{folder.name}: missing frontmatter description")

        if not openai_yaml.exists():
            failures.append(f"{folder.name}: missing agents/openai.yaml")
        else:
            ui = generate_skills_index._openai_yaml(openai_yaml)
            if "display_name" not in ui:
                failures.append(f"{folder.name}: openai.yaml missing display_name")
            if "short_description" not in ui:
                failures.append(f"{folder.name}: openai.yaml missing short_description")
            if "default_prompt" not in ui:
                failures.append(f"{folder.name}: openai.yaml missing default_prompt")
            if "allow_implicit_invocation" not in ui:
                failures.append(
                    f"{folder.name}: openai.yaml missing allow_implicit_invocation"
                )

    expected = generate_skills_index.render_index()
    if not INDEX_PATH.exists():
        failures.append(f"Missing {INDEX_PATH}")
    else:
        actual = INDEX_PATH.read_text(encoding="utf-8")
        if actual != expected:
            failures.append(
                "SKILLS_INDEX.md is stale. Run `npm run skills:sync` and retry."
            )

    return failures


def main() -> int:
    failures = _failures()
    if failures:
        print("Skill validation failed:")
        for failure in failures:
            print(f"- {failure}")
        return 1
    print("Skill validation passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
