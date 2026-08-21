// QA-2: 추첨 확률분포 검증 (BR-4) — docs/9-plan.md
// 실행: node backend/scripts/verifyDrawDistribution.js
const { drawDiscountRate } = require('../src/db/drawResults.queries');

const TRIALS = 20000;
const TARGET = { 5: 0.4, 10: 0.3, 15: 0.2, 20: 0.1 };

function main() {
  const counts = { 5: 0, 10: 0, 15: 0, 20: 0 };
  const invalid = [];

  for (let i = 0; i < TRIALS; i++) {
    const rate = drawDiscountRate();
    if (!(rate in counts)) {
      invalid.push(rate);
      continue;
    }
    counts[rate]++;
  }

  console.log(`시행 횟수: ${TRIALS}`);
  let allWithinTolerance = true;
  for (const rate of [5, 10, 15, 20]) {
    const actual = counts[rate] / TRIALS;
    const target = TARGET[rate];
    const diffPp = Math.abs(actual - target) * 100;
    const ok = diffPp <= 10;
    allWithinTolerance = allWithinTolerance && ok;
    console.log(
      `${rate}%: ${counts[rate]}건 (${(actual * 100).toFixed(2)}%, 목표 ${(target * 100).toFixed(0)}%, 오차 ${diffPp.toFixed(2)}pp) ${ok ? 'PASS' : 'FAIL'}`
    );
  }

  console.log(`5/10/15/20 이외 값: ${invalid.length}건 ${invalid.length === 0 ? 'PASS' : 'FAIL'}`);

  const pass = allWithinTolerance && invalid.length === 0;
  console.log(pass ? '\n[QA-2] PASS' : '\n[QA-2] FAIL');
  process.exit(pass ? 0 : 1);
}

main();
