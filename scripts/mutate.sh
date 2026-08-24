#!/bin/bash
#
# 검사가 정말 잡는지 확인한다.
#
# 소스를 잠깐 결함 형태로 되돌리고, 지목한 검사가 **실패하는지** 본다.
# 통과하면 그 검사는 지키는 척만 하고 있는 것이다 — 실제로 최근 다섯 개 중
# 둘이 그랬다: 캐시 해제 검사는 이름이 나오는지만 봤고(비우기만 해도 통과),
# 말풍선 위치 검사는 함수 끝 앵커가 props 타입의 닫는 괄호에 먼저 걸려
# JSX를 아예 읽지 않았다.
#
# 사용법:
#   scripts/mutate.sh <파일> <찾을 문자열> <바꿀 문자열> <검사 파일|all> <설명>
#
# 검사 파일을 `all`로 두면 전체를 돌린다. **되도록 all을 쓴다** — 이 세션에서
# 「헛돎」이 세 번 잘못 나왔고 전부 **엉뚱한 검사 파일을 겨눈** 탓이었다.
# 어느 검사가 지키는지 모르는 채로 한 파일만 돌리면 없는 구멍을 보고한다.
#
# 예:
#   scripts/mutate.sh src/game/world/textures.ts \
#     'lampGlowCache?.dispose();' '// lampGlowCache?.dispose();' \
#     tests/resourceRelease.test.ts '캐시 해제'
#
# 끝나면 원본을 되돌린다. 자동 실행(CI·pnpm 스크립트)에 걸지 않는다 —
# 원본을 잠깐 고치는 도구라 사람이 보고 있을 때만 돌려야 한다.
set -e

FILE=$1
OLD=$2
NEW=$3
TEST=$4
DESC=$5

if [ -z "$DESC" ]; then
  echo "사용법: scripts/mutate.sh <파일> <찾을 문자열> <바꿀 문자열> <검사 파일> <설명>"
  exit 2
fi

BACKUP=$(mktemp)
cp "$FILE" "$BACKUP"
echo "백업: $BACKUP"

# 첫 한 곳만 바꾼다. 여러 곳을 한꺼번에 바꾸면 무엇이 걸렸는지 알 수 없다.
FILE="$FILE" OLD="$OLD" NEW="$NEW" python3 -c '
import os, pathlib, sys
path = pathlib.Path(os.environ["FILE"])
source = path.read_text()
old = os.environ["OLD"]
if old not in source:
    sys.exit(f"찾을 문자열이 없다: {old[:60]}")
path.write_text(source.replace(old, os.environ["NEW"], 1))
'

if [ "$TEST" = "all" ]; then
  RUN=(npx vitest run)
else
  RUN=(npx vitest run "$TEST")
fi

if "${RUN[@]}" >/dev/null 2>&1; then
  echo "헛돎: $DESC — 결함을 넣었는데 통과한다"
  STATUS=1
else
  echo "잡음: $DESC"
  STATUS=0
fi

cp "$BACKUP" "$FILE"
rm -f "$BACKUP"
exit $STATUS
