# Codex 스킬 목록

> 이 문서는 `.agents/scripts/generate_skills_index.py`로 자동 생성됩니다. 스킬을 추가, 삭제, 수정한 뒤에는 `npm run skills:sync`를 실행하세요.

## 운영 규칙

- 스킬의 실제 내용은 각 폴더의 `SKILL.md`를 기준으로 합니다.
- 기능 개발, 기존 기능 변경, 업데이트 완료 시 AI는 `Skill Impact Check`를 수행합니다.
- 스킬이 추가, 삭제, 변경되면 `SKILLS_INDEX.md`를 재생성하고 `npm run skills:check`로 검증합니다.

## 설치된 스킬

| 폴더 | 스킬명 | 표시명 | 기능 요약 | 자동 호출 |
| --- | --- | --- | --- | --- |
| accessibility | accessibility | 접근성 점검 | WCAG·키보드·폼 접근성 점검 | false |
| createtree-office-ops | createtree-office-ops | CT Office 운영 | 사내 포털·업무·거래처 운영 기준 | true |
| office-drizzle-guardian | office-drizzle-guardian | Office Drizzle Guardian | Drizzle·Railway DB 변경 안전 기준 | true |
| office-google-workspace | office-google-workspace | Office Google Workspace | Drive·Forms·Calendar 연동 기준 | true |
| office-pdca-workflow | office-pdca-workflow | Office PDCA | Plan·Design·Devlog 문서화 기준 | true |
| office-pdf-contracts | office-pdf-contracts | Office PDF Contracts | 견적·계약·PDF 금액 흐름 기준 | true |
| office-tiptap-richtext | office-tiptap-richtext | Office Tiptap | 리치 텍스트 저장·렌더링 보호 규칙 | true |
| performance | performance | 성능 최적화 | 로딩·번들·렌더링 성능 점검 | false |
| react-best-practices | vercel-react-best-practices | Vercel React 품질 | React 컴포넌트 성능·구조 점검 | false |
| security-best-practices | security-best-practices | Security Best Practices | Security reviews and secure-by-default guidance | false |
| use-railway | use-railway | Railway 운영 | Railway 배포·환경변수·장애 점검 | false |
| web-design-guidelines | web-design-guidelines | 웹 디자인 가이드 | UI·UX·접근성 기본 품질 점검 | false |
| web-quality-audit | web-quality-audit | 웹 품질 감사 | 성능·접근성·SEO 종합 점검 | false |
