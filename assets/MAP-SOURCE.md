# 시도 지도 경계 출처

본 데이터는 통계청 통계지리정보서비스(SGIS, https://sgis.kostat.go.kr)에서 공공누리 제1유형으로 개방한 행정동 경계를 가공한 것이며(가공: vuski/admdongkor, https://github.com/vuski/admdongkor), CC BY 4.0으로 배포됩니다.

- 원본: `vuski/admdongkor`의 2026년 10월 1일 시도 경계(light)
- 고정 소스: https://raw.githubusercontent.com/vuski/admdongkor/d5d5a821c8de6cc337d47eeca604d7af76271c9b/parquet/simplified/sido_20261001_light.parquet
- 원본 SHA-256: `54f7dd2dd345946a895ae8275d5bab1f131baeeceb0ccd623d0d82fc94e6cfe0`
- 원본 라이선스: [MAP-DATA-LICENSE.txt](MAP-DATA-LICENSE.txt)
- 변경: Shapely로 0.003도 허용 오차의 위상 보존 단순화, 좌표를 SVG용 등거리 원통 형태로 투영(`x = (경도 - 124.5) × 0.8 × 80 + 20`, `y = (38.7 - 위도) × 80 + 20`), 좌표 소수점 1자리 반올림. 통계 지도용으로 세부 경계를 단순화했으며 측량·행정 경계 판정용이 아닙니다.
- 배포 산출물: `map-regions.js` (16개 시도, 제주 포함; 통합 지역 코드 12)

사용자가 조회한 월의 경계로 바꾸는 방식이 아니라, 표와 동일하게 광주·전남을 통합 기준으로 집계해 2026년 10월 시도 경계에 표시합니다. 군위군 등 소규모 경계 변경 전후의 과거 통계를 새 경계로 재배분하지 않습니다.

외부 지도 API, 타일 서버, CDN, 위치 정보, 지도 인증키를 사용하지 않습니다. 지도 경로 파일과 렌더링 코드는 정적 사이트에서 함께 제공합니다.
