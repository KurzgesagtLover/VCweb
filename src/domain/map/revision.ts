export function assertMapRevision(expected: number, current: number) {
  if (expected !== current) {
    throw new Error(`지도 리비전 충돌: 화면 ${expected}, 현재 ${current}`);
  }
}
