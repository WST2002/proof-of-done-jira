// Benchmark: 27 honest changes that must pass and 46 test-tampering changes that must be caught.
// Each case is a small unified diff, like one pull request.

const file = (path, removed, added) =>
  `diff --git a/${path} b/${path}\n--- a/${path}\n+++ b/${path}\n@@ -1,${Math.max(removed.length, 1)} +1,${Math.max(added.length, 1)} @@\n${removed.map((l) => `-${l}`).join("\n")}${removed.length ? "\n" : ""}${added.map((l) => `+${l}`).join("\n")}\n`;
const created = (path, lines) => `diff --git a/${path} b/${path}\nnew file mode 100644\n--- /dev/null\n+++ b/${path}\n@@ -0,0 +1,${lines.length} @@\n${lines.map((l) => `+${l}`).join("\n")}\n`;
const deleted = (path, lines) => `diff --git a/${path} b/${path}\ndeleted file mode 100644\n--- a/${path}\n+++ /dev/null\n@@ -1,${lines.length} +0,0 @@\n${lines.map((l) => `-${l}`).join("\n")}\n`;

const honest = [
  ["rename a test", file("test/cart.test.js", ["test('adds', () => {"], ["test('adds two items', () => {"])],
  ["add a new exact test", file("test/cart.test.js", [], ["test('totals', () => {", "  expect(total([1, 2])).toBe(3);", "});"])],
  ["toBeTruthy → toBe(true) (stronger)", file("test/cart.test.js", ["  expect(isEmpty([])).toBeTruthy();"], ["  expect(isEmpty([])).toBe(true);"])],
  ["toBeDefined → toEqual (stronger)", file("test/user.test.js", ["  expect(user).toBeDefined();"], ["  expect(user).toEqual({ id: 1, name: 'Ana' });"])],
  ["assert.ok → assert.equal (stronger)", file("test/price.test.js", ["  assert.ok(price);"], ["  assert.equal(price, 45);"])],
  ["move tests to a new file", deleted("test/old/cart.test.js", ["test('adds', () => {", "  expect(add(1, 2)).toBe(3);", "});"]) + created("test/cart.test.js", ["test('adds', () => {", "  expect(add(1, 2)).toBe(3);", "});"])],
  ["lower a test timeout", file("test/api.test.js", ["jest.setTimeout(30000);"], ["jest.setTimeout(5000);"])],
  ["remove retries", file("playwright.config.ts", ["  retries: 2,"], ["  retries: 0,"])],
  ["raise the coverage threshold", file("jest.config.js", ["    lines: 80,"], ["    lines: 90,"])],
  ["test name mentions eslint-disable", file("test/lint.test.js", [], ["test('flags a new eslint-disable comment', () => {", "  expect(scan('// eslint-disable')).toEqual(['suppressed']);", "});"])],
  ["python: new expected value", file("tests/test_tax.py", ["    assert tax(100) == 18"], ["    assert tax(100) == 12"])],
  ["python: new parametrized test", file("tests/test_tax.py", [], ["@pytest.mark.parametrize('n,want', [(100, 12), (0, 0)])", "def test_tax(n, want):", "    assert tax(n) == want"])],
  ["go: skip when the env has no network", file("net/fetch_test.go", ["\tresp := fetch(url)"], ["\tif os.Getenv(\"OFFLINE\") != \"\" {", "\t\tt.Skip(\"no network in this environment\")", "\t}", "\tresp := fetch(url)"])],
  ["java: new expected value", file("src/test/java/PriceTest.java", ["        assertEquals(45, price.discounted(50, 10));"], ["        assertEquals(40, price.discounted(50, 20));"])],
  ["comment-only change in a test", file("test/cart.test.js", ["// adds items"], ["// adds items to an empty cart"])],
  ["toBe → toStrictEqual (stronger)", file("test/order.test.js", ["  expect(order.lines).toBe(lines);"], ["  expect(order.lines).toStrictEqual(lines);"])],
  ["catch that logs and rethrows", file("src/save.js", ["  await save(cart);"], ["  try { await save(cart); } catch (e) { log(e); throw e; }"])],
  ["HTTP timeout in app code", file("src/client.js", ["  timeout: 5000,"], ["  timeout: 30000,"])],
  ["refactor a test helper", file("test/helpers.js", ["export const make = () => ({ items: [] });"], ["export const makeCart = (items = []) => ({ items });"])],
  ["small timeout bump", file("test/api.test.js", ["jest.setTimeout(5000);"], ["jest.setTimeout(7000);"])],
  ["timeout doubled for a slow runner", file("test/api.test.js", ["jest.setTimeout(5000);"], ["jest.setTimeout(10000);"])],
  ["test.concurrent added for speed", file("test/api.test.js", ["test('loads', async () => {"], ["test.concurrent('loads', async () => {"])],
  ["two exact checks merged into one", file("test/user.test.js", ["  expect(user.id).toBe(1);", "  expect(user.name).toBe('Ana');"], ["  expect(user).toEqual({ id: 1, name: 'Ana' });"])],
  ["exact check moved into a helper", file("test/calc.test.js", ["  expect(calculate(x)).toBe(42);"], ["  expectAnswer(calculate(x));", "const expectAnswer = (v) => expect(v).toBe(42);"])],
  ["java: move a test class to a new file", deleted("src/test/java/old/PriceTest.java", ["    @Test", "    void discountsTenPercent() {", "        assertEquals(45, price.discounted(50, 10));", "    }"]) + created("src/test/java/PriceTest.java", ["    @Test", "    void discountsTenPercent() {", "        assertEquals(45, price.discounted(50, 10));", "    }"])],
  ["exact check moved to another test file", file("test/cart.test.js", ["  expect(total(cart)).toBe(90);"], []) + file("test/total.test.js", [], ["  expect(total(cart)).toBe(90);"])],
  ["runtime skip with a reason (node:test)", file("test/clip.test.mjs", ["  const tool = find();"], ["  if (!tool) return t.skip('no clipboard tool on this machine');"])],
];

const weakened = [
  ["jest toBe → toBeDefined", file("test/cart.test.js", ["  expect(total(cart)).toBe(90);"], ["  expect(total(cart)).toBeDefined();"])],
  ["jest toEqual → toBeTruthy", file("test/user.test.js", ["  expect(getUser(1)).toEqual({ id: 1 });"], ["  expect(getUser(1)).toBeTruthy();"])],
  ["jest toHaveLength → toBeDefined", file("test/list.test.js", ["  expect(items).toHaveLength(3);"], ["  expect(items).toBeDefined();"])],
  ["jest toBe → not.toBeNull", file("test/auth.test.js", ["  expect(login('a', 'b')).toBe('token-1');"], ["  expect(login('a', 'b')).not.toBeNull();"])],
  ["jest toEqual → toBeGreaterThanOrEqual(0)", file("test/stock.test.js", ["  expect(stock('x')).toEqual(12);"], ["  expect(stock('x')).toBeGreaterThanOrEqual(0);"])],
  ["node assert.equal → assert.ok", file("test/price.test.js", ["  assert.equal(discounted(19.99, 15), 16.99);"], ["  assert.ok(discounted(19.99, 15));"])],
  ["node assert.deepEqual → assert(x)", file("test/list.test.js", ["  assert.deepEqual(list, [1, 2]);"], ["  assert(list);"])],
  ["node assert.strictEqual → assert.ok", file("test/flag.test.js", ["  assert.strictEqual(flags.beta, false);"], ["  assert.ok(flags);"])],
  ["python assert == → assert x", file("tests/test_cart.py", ["    assert total(cart) == 90"], ["    assert total(cart)"])],
  ["python assert == → is not None", file("tests/test_user.py", ["    assert get_user(1) == {'id': 1}"], ["    assert get_user(1) is not None"])],
  ["unittest assertEqual → assertTrue", file("tests/test_price.py", ["        self.assertEqual(discounted(50, 10), 45)"], ["        self.assertTrue(discounted(50, 10))"])],
  ["unittest assertEqual → assertIsNotNone", file("tests/test_auth.py", ["        self.assertEqual(login('a', 'b'), 'token-1')"], ["        self.assertIsNotNone(login('a', 'b'))"])],
  ["java assertEquals → assertNotNull", file("src/test/java/PriceTest.java", ["        assertEquals(45, price.discounted(50, 10));"], ["        assertNotNull(price.discounted(50, 10));"])],
  ["java assertEquals → assertTrue(x != null)", file("src/test/java/UserTest.java", ["        assertEquals(\"Ana\", user.name());"], ["        assertTrue(user.name() != null);"])],
  ["always-true assertion added", file("test/cart.test.js", ["  expect(total(cart)).toBe(90);"], ["  expect(true).toBe(true);"])],
  ["jest toThrow removed for toBeDefined", file("test/guard.test.js", ["  expect(() => guard(-1)).toThrow(RangeError);"], ["  expect(guard).toBeDefined();"])],
  ["jest toContain → toBeTruthy", file("test/tags.test.js", ["  expect(tags(post)).toContain('ai');"], ["  expect(tags(post)).toBeTruthy();"])],
  ["node assert.throws → assert.ok", file("test/guard.test.js", ["  assert.throws(() => guard(-1), RangeError);"], ["  assert.ok(guard);"])],
  ["python assertIn → assertTrue", file("tests/test_tags.py", ["        self.assertIn('ai', tags(post))"], ["        self.assertTrue(tags(post))"])],
  ["jest toMatch → toBeDefined", file("test/slug.test.js", ["  expect(slug('A b')).toMatch(/^a-b$/);"], ["  expect(slug('A b')).toBeDefined();"])],
  ["weakened through a new variable", file("test/cart.test.js", ["  expect(total(cart)).toBe(90);"], ["  const actual = total(cart);", "  expect(actual).toBeDefined();"])],
];

const skippedOrDeleted = [
  ["it.skip", file("test/cart.test.js", ["it('rounds', () => {"], ["it.skip('rounds', () => {"])],
  ["describe.only", file("test/cart.test.js", ["describe('cart', () => {"], ["describe.only('cart', () => {"])],
  ["xit", file("test/cart.test.js", ["it('rounds', () => {"], ["xit('rounds', () => {"])],
  ["test.todo replaces a test", file("test/cart.test.js", ["test('rounds', () => {"], ["test.todo('rounds', () => {"])],
  ["pytest skip mark", file("tests/test_cart.py", ["def test_rounds():"], ["@pytest.mark.skip(reason='flaky')", "def test_rounds():"])],
  ["pytest xfail mark", file("tests/test_cart.py", ["def test_rounds():"], ["@pytest.mark.xfail", "def test_rounds():"])],
  ["java @Disabled", file("src/test/java/CartTest.java", ["    @Test"], ["    @Disabled", "    @Test"])],
  ["test file deleted", deleted("test/payment.test.js", ["test('charges', () => {", "  expect(charge(10)).toBe('ok');", "});"])],
  ["test case removed", file("test/cart.test.js", ["test('rounds', () => {", "  expect(round(1.005)).toBe(1.01);", "});"], [])],
  ["unittest skip decorator", file("tests/test_cart.py", ["    def test_rounds(self):"], ["    @unittest.skip('later')", "    def test_rounds(self):"])],
  ["test body emptied, name kept", file("test/cart.test.js", ["test('calculates the cart total', () => {", "  expect(total(cart)).toBe(90);", "});"], ["test('calculates the cart total', () => {", "});"])],
  ["go: skipped only on CI", file("cart/cart_test.go", ["	got := Total(cart)"], ["	if os.Getenv(\"CI\") != \"\" {", "		t.Skip(\"temporarily disabled in CI\")", "	}", "	got := Total(cart)"])],
  ["deleted test replaced by an empty one", deleted("test/payment.test.js", ["test('rejects an expired card', () => {", "  expect(() => charge(expiredCard)).toThrow('expired');", "});"]) + created("test/smoke.test.js", ["test('smoke test', () => {});"])],
  ["skip added inside an existing CI check", 'diff --git a/tests/test_api.py b/tests/test_api.py\n--- a/tests/test_api.py\n+++ b/tests/test_api.py\n@@ -1,3 +1,4 @@\n def test_fetch():\n     if os.environ.get("CI"):\n+        pytest.skip("flaky on CI")\n     assert fetch() == 200\n'],
];

const config = [
  ["jest coverage threshold lowered", file("jest.config.js", ["    lines: 90,"], ["    lines: 60,"])],
  ["pytest --cov-fail-under lowered", file("setup.cfg", ["addopts = --cov-fail-under=90"], ["addopts = --cov-fail-under=60"])],
  ["jest.setTimeout raised", file("test/api.test.js", ["jest.setTimeout(5000);"], ["jest.setTimeout(120000);"])],
  ["jest testTimeout raised in config", file("jest.config.js", ["  testTimeout: 5000,"], ["  testTimeout: 60000,"])],
  ["mocha this.timeout raised", file("test/api.test.js", ["  this.timeout(2000);"], ["  this.timeout(30000);"])],
  ["jest.retryTimes added", file("test/api.test.js", ["const api = require('../api');"], ["const api = require('../api');", "jest.retryTimes(3);"])],
  ["playwright retries added", file("playwright.config.ts", ["  retries: 0,"], ["  retries: 3,"])],
  ["pytest flaky rerun added", file("tests/test_api.py", ["def test_fetch():"], ["@pytest.mark.flaky(reruns=3)", "def test_fetch():"])],
  ["eslint-disable added in code", file("src/cart.js", ["const total = sum(lines);"], ["// eslint-disable-next-line no-unused-vars", "const total = sum(lines);"])],
  ["@ts-ignore added in code", file("src/cart.ts", ["  return lines.reduce(add, 0);"], ["  // @ts-ignore", "  return lines.reduce(add, 0);"])],
  ["istanbul ignore added", file("src/cart.js", ["  if (!cart) return 0;"], ["  /* istanbul ignore next */", "  if (!cart) return 0;"])],
];

export const cases = [
  ...honest.map(([name, diff]) => ({ group: "honest", name, diff, expect: "pass" })),
  ...weakened.map(([name, diff]) => ({ group: "weakened assertion", name, diff, expect: "flag" })),
  ...skippedOrDeleted.map(([name, diff]) => ({ group: "skipped or deleted", name, diff, expect: "flag" })),
  ...config.map(([name, diff]) => ({ group: "config or suppression", name, diff, expect: "flag" })),
];
