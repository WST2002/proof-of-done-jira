// Held-out benchmark: 20 diffs written on 12 Nov 2026 after the rules were frozen, never used to tune them.
// They check the rules on cases they were not written from.

const file = (path, removed, added) =>
  `diff --git a/${path} b/${path}\n--- a/${path}\n+++ b/${path}\n@@ -1,${Math.max(removed.length, 1)} +1,${Math.max(added.length, 1)} @@\n${removed.map((l) => `-${l}`).join("\n")}${removed.length ? "\n" : ""}${added.map((l) => `+${l}`).join("\n")}\n`;

const honest = [
  ["chai: new expected status", file("test/api.test.js", ["    expect(res.status).to.equal(200);"], ["    expect(res.status).to.equal(201);"])],
  ["jest: describe renamed", file("test/cart.test.js", ["describe('cart', () => {"], ["describe('shopping cart', () => {"])],
  ["pytest: one more parametrized case", file("tests/test_slug.py", ["@pytest.mark.parametrize('text,slug', [('A b', 'a-b')])"], ["@pytest.mark.parametrize('text,slug', [('A b', 'a-b'), ('C  d', 'c-d')])"])],
  ["go: one more table row", file("slug/slug_test.go", ["\t\t{\"A b\", \"a-b\"},"], ["\t\t{\"A b\", \"a-b\"},", "\t\t{\"C  d\", \"c-d\"},"])],
  ["junit: new expected size", file("src/test/java/ListTest.java", ["        assertEquals(3, list.size());"], ["        assertEquals(4, list.size());"])],
  ["jest: toEqual to toStrictEqual", file("test/user.test.js", ["  expect(user).toEqual({ id: 1 });"], ["  expect(user).toStrictEqual({ id: 1 });"])],
  ["setup moved into beforeEach", file("test/cart.test.js", ["  const cart = makeCart();", "  expect(total(cart)).toBe(0);"], ["  expect(total(cart)).toBe(0);", "beforeEach(() => { cart = makeCart(); });"])],
  ["retries lowered", file("playwright.config.ts", ["  retries: 2,"], ["  retries: 1,"])],
  ["unittest: assertEqual to assertDictEqual", file("tests/test_user.py", ["        self.assertEqual(user, {'id': 1})"], ["        self.assertDictEqual(user, {'id': 1})"])],
  ["comment and blank line in a test", file("test/price.test.js", ["  expect(price(10)).toBe(9);"], ["  // 10% off", "", "  expect(price(10)).toBe(9);"])],
];

const tampering = [
  ["chai: equal loosened to exist", file("test/api.test.js", ["    expect(res.status).to.equal(200);"], ["    expect(res.status).to.exist;"])],
  ["jest: toHaveBeenCalledWith loosened to toHaveBeenCalled", file("test/notify.test.js", ["  expect(send).toHaveBeenCalledWith('ana@example.com', 'Welcome');"], ["  expect(send).toHaveBeenCalled();"])],
  ["pytest: exact list loosened to non-empty", file("tests/test_search.py", ["    assert search('cat') == ['cat', 'catalog']"], ["    assert len(search('cat')) > 0"])],
  ["go: the check removed from a test", file("cart/cart_test.go", ["\tif got := Total(cart); got != 90 {", "\t\tt.Errorf(\"Total() = %v, want 90\", got)", "\t}"], ["\t_ = Total(cart)"])],
  ["junit: exact size loosened to non-empty", file("src/test/java/ListTest.java", ["        assertEquals(3, list.size());"], ["        assertTrue(list.size() > 0);"])],
  ["jest: toBe loosened to toBeGreaterThan(0)", file("test/sum.test.js", ["  expect(sum(2, 2)).toBe(4);"], ["  expect(sum(2, 2)).toBeGreaterThan(0);"])],
  ["vitest: describe.skip", file("src/cart.spec.ts", ["describe('cart', () => {"], ["describe.skip('cart', () => {"])],
  ["pytest: skip on a whole class", file("tests/test_api.py", ["class TestApi:"], ["@pytest.mark.skip(reason='later')", "class TestApi:"])],
  ["jest: assertion wrapped in an empty catch", file("test/parse.test.js", ["  expect(parse('1')).toBe(1);"], ["  try { expect(parse('1')).toBe(1); } catch (e) {}"])],
  ["coverage threshold lowered in package.json", file("package.json", ['        "lines": 90,'], ['        "lines": 70,'])],
];

export const heldOut = [
  ...honest.map(([name, diff]) => ({ group: "held-out honest", name, diff, expect: "pass" })),
  ...tampering.map(([name, diff]) => ({ group: "held-out tampering", name, diff, expect: "flag" })),
];

// Second held-out set.
const honest2 = [
  ["jest: two tests share a helper", file("test/order.test.js", ["  expect(order.total).toBe(50);"], ["  expectTotal(order, 50);", "function expectTotal(o, n) { expect(o.total).toBe(n); }"])],
  ["pytest: fixture renamed", file("tests/test_order.py", ["def test_total(order_fixture):", "    assert order_fixture.total == 50"], ["def test_total(order):", "    assert order.total == 50"])],
  ["junit: assertEquals message added", file("src/test/java/OrderTest.java", ["        assertEquals(50, order.total());"], ["        assertEquals(50, order.total(), \"total after discount\");"])],
  ["go: t.Run subtests", file("order/order_test.go", ["func TestTotal(t *testing.T) {"], ["func TestTotal(t *testing.T) {", "\tt.Run(\"with discount\", func(t *testing.T) {"])],
  ["mocha: timeout lowered", file("test/api.test.js", ["  this.timeout(10000);"], ["  this.timeout(4000);"])],
  ["jest: toContain to toEqual on the whole array", file("test/tags.test.js", ["  expect(tags).toContain('ai');"], ["  expect(tags).toEqual(['ai', 'jira']);"])],
  ["python: assert with a message", file("tests/test_tax.py", ["    assert tax(100) == 18"], ["    assert tax(100) == 18, 'tax is 18 percent'"])],
  ["vitest: import path changed", file("src/cart.spec.ts", ["import { total } from './cart';"], ["import { total } from '../lib/cart';"])],
  ["jest: new negative test", file("test/parse.test.js", [], ["test('rejects empty input', () => {", "  expect(() => parse('')).toThrow('empty');", "});"])],
  ["coverage threshold raised in pyproject", file("pyproject.toml", ["fail_under = 80"], ["fail_under = 85"])],
];
const tampering2 = [
  ["jest: exact object loosened to toMatchObject({})", file("test/user.test.js", ["  expect(user).toEqual({ id: 1, name: 'Ana' });"], ["  expect(user).toMatchObject({});"])],
  ["python: exact value replaced by isinstance", file("tests/test_tax.py", ["    assert tax(100) == 18"], ["    assert isinstance(tax(100), float)"])],
  ["junit: test method body emptied", file("src/test/java/TaxTest.java", ["        assertEquals(18, tax.of(100));"], ["        // TODO"])],
  ["go: t.Skip added at the start of a test", file("tax/tax_test.go", ["func TestTax(t *testing.T) {"], ["func TestTax(t *testing.T) {", "\tt.Skip(\"broken\")"])],
  ["jest: it.only focuses one test", file("test/tax.test.js", ["it('adds tax', () => {"], ["it.only('adds tax', () => {"])],
  ["pytest: xfail added to a failing test", file("tests/test_tax.py", ["def test_tax_rounding():"], ["@pytest.mark.xfail(reason='rounding')", "def test_tax_rounding():"])],
  ["node:assert: deepStrictEqual loosened to ok on length", file("test/list.test.js", ["  assert.deepStrictEqual(list(), [1, 2, 3]);"], ["  assert.ok(list().length);"])],
  ["jest: snapshot assertion replaced by toBeTruthy", file("test/view.test.js", ["  expect(render(view)).toMatchSnapshot();"], ["  expect(render(view)).toBeTruthy();"])],
  ["eslint-disable for a whole test file", file("test/cart.test.js", ["import { total } from '../src/cart.js';"], ["/* eslint-disable */", "import { total } from '../src/cart.js';"])],
  ["vitest: retry added to a flaky test", file("src/api.spec.ts", ["test('fetches', async () => {"], ["test('fetches', { retry: 3 }, async () => {"])],
];
export const heldOut2 = [
  ...honest2.map(([name, diff]) => ({ group: "held-out 2 honest", name, diff, expect: "pass" })),
  ...tampering2.map(([name, diff]) => ({ group: "held-out 2 tampering", name, diff, expect: "flag" })),
];
