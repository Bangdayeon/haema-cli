#!/bin/bash
# PostToolUse hook: finish_task 완료 후 패턴 기반 스킬 제안 확인

AUTH="$HOME/.votra/auth.json"
[ -f "$AUTH" ] || exit 0

APP_URL=$(jq -r '.appUrl // empty' "$AUTH" 2>/dev/null)
API_KEY=$(jq -r '.apiKey // empty' "$AUTH" 2>/dev/null)
[ -z "$APP_URL" ] || [ -z "$API_KEY" ] && exit 0

# stdin에서 tool_response의 projectId 추출
TOOL_DATA=$(cat)
PROJECT_ID=$(echo "$TOOL_DATA" | jq -r '.tool_response.projectId // .tool_input.projectId // empty' 2>/dev/null)
[ -z "$PROJECT_ID" ] && exit 0

RESP=$(curl -sf --max-time 5 \
  -H "Authorization: Bearer $API_KEY" \
  "${APP_URL}/api/memory/skill-suggestions?projectId=${PROJECT_ID}" 2>/dev/null)
[ $? -ne 0 ] && exit 0

COUNT=$(echo "$RESP" | jq -r '.count // 0' 2>/dev/null)
[ "$COUNT" -le 0 ] && exit 0

NAMES=$(echo "$RESP" | jq -r '[.suggestions[].name] | join(", ")' 2>/dev/null)
echo ""
echo "💡 반복 패턴 ${COUNT}개 감지: ${NAMES}"
echo "propose_skill 툴로 등록하면 다음 세션부터 load_skill로 자동 로드돼요."
