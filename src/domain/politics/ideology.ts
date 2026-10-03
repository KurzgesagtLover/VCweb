/**
 * 이 세계관에는 별도의 이념 필드가 없다.
 * 정치 스냅샷의 민주성 지표를 체제 성격으로 옮겨 국가 선택 화면에 보여 준다.
 */
export function regimeIdeologyLabel(democracy: number | null) {
  if (democracy === null) return "미상";
  if (democracy >= 75) return "민주주의";
  if (democracy >= 50) return "제한적 민주주의";
  if (democracy >= 25) return "권위주의";
  return "전제주의";
}

export function electionPracticeLabel(democracy: number | null) {
  if (democracy === null) return "미상";
  if (democracy >= 50) return "정기 실시";
  if (democracy >= 25) return "형식적 실시";
  return "하지 않음";
}
