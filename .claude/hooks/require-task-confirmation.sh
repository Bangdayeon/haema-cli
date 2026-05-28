#!/bin/bash
FLAG_FILE="/tmp/votra_start_confirmed"

if [ -f "$FLAG_FILE" ]; then
  rm "$FLAG_FILE"
  exit 0
fi

TASK_ID=$(cat | jq -r '.tool_input.task_id // "알 수 없음"' 2>/dev/null || echo "알 수 없음")

cat <<EOF
{"continue": false, "stopReason": "⛔ start_task 차단됨 — 사용자 확인 필요\n\n태스크 ID: ${TASK_ID}\n\n【필수 절차】\n1. 위 태스크 내용을 사용자에게 보여주고 시작 여부를 확인하세요.\n2. 사용자가 승인하면: Bash 도구로 'touch /tmp/votra_start_confirmed' 실행\n3. 그 후 start_task를 다시 호출하세요.\n\n사용자 확인 없이는 start_task를 호출할 수 없습니다."}
EOF
