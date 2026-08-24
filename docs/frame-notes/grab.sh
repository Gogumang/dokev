#!/bin/bash
# 도깨비 공개 영상 → 프레임 이미지.
#
# 영상은 저작물이라 **스크래치패드에만** 두고 저장소에 넣지 않는다.
# 뽑은 프레임도 마찬가지다 — 분석에만 쓰고 문서에는 글로만 옮긴다.
set -e
cd "$(dirname "$0")"

# id:이름 — 이름이 곧 프레임 폴더가 된다
VIDEOS=(
  "LNXamzH_TQk:extended"      # Official Extended Gameplay Trailer (3:52)
  "Bha7Y9QG5ug:onl"           # gamescom ONL 게임플레이 트레일러
  "_1Fu0Twlan8:walkthrough"   # Official Developer Walkthrough
)

# 프레임 간격(초). 2.5초면 4분 영상에서 약 93장이다 — 장면 전환을 놓치지 않으면서
# 한 번에 볼 만한 수다.
STEP=${STEP:-2.5}
# 가로 크기(px). 분석용이라 원본 해상도가 필요 없다.
WIDTH=${WIDTH:-960}

for entry in "${VIDEOS[@]}"; do
  id="${entry%%:*}"
  name="${entry##*:}"

  if [ ! -f "$name.mp4" ]; then
    echo "== 내려받기: $name ($id)"
    yt-dlp --no-update --no-warnings \
      -f 'bv*[height<=720]+ba/b[height<=720]/b' \
      --merge-output-format mp4 \
      -o "$name.%(ext)s" "https://www.youtube.com/watch?v=$id"
  fi

  mkdir -p "frames/$name"
  if [ -z "$(ls -A "frames/$name" 2>/dev/null)" ]; then
    echo "== 프레임 뽑기: $name (${STEP}초 간격, ${WIDTH}px)"
    ffmpeg -loglevel error -i "$name.mp4" \
      -vf "fps=1/$STEP,scale=$WIDTH:-2" -q:v 4 \
      "frames/$name/%03d.jpg"
  fi
  echo "$name: $(ls "frames/$name" | wc -l | tr -d ' ')장"
done
