import { describe, expect, test } from 'bun:test';

// Guards the release matrix so artifact naming and target coverage cannot
// silently regress. Each entry is (bun target, published artifact name).
const releaseYml = await Bun.file(new URL('../.github/workflows/release.yml', import.meta.url)).text();

const EXPECTED: Array<{ target: string; artifact: string }> = [
  { target: 'bun-darwin-arm64', artifact: 'tm-darwin-arm64' },
  { target: 'bun-darwin-x64', artifact: 'tm-darwin-x86_64' },
  { target: 'bun-linux-x64', artifact: 'tm-linux-x86_64' },
  { target: 'bun-linux-arm64', artifact: 'tm-linux-arm64' },
];

describe('release matrix', () => {
  const parsed: Array<{ target: string; artifact: string }> = [];
  const matrixBlock = releaseYml.split('runs-on: ${{ matrix.os }}')[0] ?? '';
  const re = /target:\s*(\S+)\s*\n\s*artifact:\s*(\S+)/g;
  for (let m = re.exec(matrixBlock); m !== null; m = re.exec(matrixBlock)) {
    parsed.push({ target: m[1]!, artifact: m[2]! });
  }

  test('covers exactly the expected targets and artifacts', () => {
    expect(parsed).toEqual(EXPECTED);
  });

  test('every OS ships both an arm64 and an x86_64 artifact', () => {
    for (const os of ['darwin', 'linux']) {
      const arches = parsed.filter((e) => e.artifact.includes(`-${os}-`)).map((e) => e.artifact.split(`-${os}-`)[1]);
      expect(arches.sort()).toEqual(['arm64', 'x86_64']);
    }
  });

  test('Homebrew formula and the attached artifacts stay in sync', async () => {
    const formula = await Bun.file(new URL('../Formula/tm.rb', import.meta.url)).text();
    for (const { artifact } of EXPECTED) {
      expect(formula).toContain(`${artifact}.tar.gz`);
    }
  });
});
