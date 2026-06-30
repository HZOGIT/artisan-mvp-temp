import { RuleTester } from "eslint";
import noSilentCatch from "../no-silent-catch.mjs";

const ruleTester = new RuleTester({
  languageOptions: { ecmaVersion: 2022, sourceType: "module" },
});

ruleTester.run("no-silent-catch", noSilentCatch, {
  valid: [
    /* catch with rethrow */
    { code: `try { x() } catch (e) { throw e; }` },
    { code: `try { x() } catch (e) { logger.error('fail', e); throw e; }` },
    /* catch with log */
    { code: `try { x() } catch (e) { logger.warn('context', e); }` },
    { code: `try { x() } catch (e) { logger.error('context'); }` },
    { code: `try { x() } catch (e) { console.error('fail', e); }` },
    { code: `try { x() } catch (e) { app.log.warn({ err: e }, 'msg'); }` },
    /* catch with best-effort annotation */
    { code: `try { x() } catch (e) { /* ponytail: best-effort — non critique */ }` },
    { code: `try { x() } catch (_) { /* best-effort — cleanup optionnel */ }` },
    /* .catch with expression body (not block) */
    { code: `p.catch(() => void 0)` },
    { code: `p.catch(() => null)` },
    { code: `p.catch(() => undefined)` },
    { code: `p.catch(() => ({ count: 0 }))` },
    /* .catch with log */
    { code: `p.catch((e) => { logger.warn('msg', e); })` },
    { code: `p.catch((err) => { app.log.warn({ err }, 'msg'); })` },
    /* .catch with rethrow */
    { code: `p.catch((e) => { throw e; })` },
    /* .catch with best-effort annotation */
    { code: `p.catch((e) => { /* ponytail: best-effort */ })` },
    { code: `p.catch(() => { /* best-effort — email non-critique */ })` },
    /* .then second arg with log */
    { code: `p.then(ok, (e) => { logger.error('fail', e); })` },
    /* .then single arg — no rejection handler */
    { code: `p.then((v) => v)` },
  ],
  invalid: [
    /* empty catch block */
    {
      code: `try { x() } catch (e) { }`,
      errors: [{ message: "Catch silencieux : logger.warn/error ou throw requis, ou annoter /* ponytail: best-effort … */ si volontaire." }],
    },
    /* catch without binding — empty */
    {
      code: `try { x() } catch { }`,
      errors: [{ message: "Catch silencieux : logger.warn/error ou throw requis, ou annoter /* ponytail: best-effort … */ si volontaire." }],
    },
    /* catch does something but no log or throw */
    {
      code: `try { x() } catch (e) { cleanup(); }`,
      errors: [{ message: "Catch silencieux : logger.warn/error ou throw requis, ou annoter /* ponytail: best-effort … */ si volontaire." }],
    },
    /* empty .catch block */
    {
      code: `p.catch(() => {})`,
      errors: [{ message: "Rejection handler silencieux : logger.warn/error ou throw requis, ou annoter /* ponytail: best-effort … */ si volontaire." }],
    },
    {
      code: `p.catch((e) => {})`,
      errors: [{ message: "Rejection handler silencieux : logger.warn/error ou throw requis, ou annoter /* ponytail: best-effort … */ si volontaire." }],
    },
    /* .catch does something but no log or throw */
    {
      code: `p.catch((e) => { doSomething(); })`,
      errors: [{ message: "Rejection handler silencieux : logger.warn/error ou throw requis, ou annoter /* ponytail: best-effort … */ si volontaire." }],
    },
    /* .then second arg silent */
    {
      code: `p.then(ok, (e) => {})`,
      errors: [{ message: "Rejection handler silencieux (.then second arg) : logger.warn/error ou throw requis, ou annoter /* ponytail: best-effort … */ si volontaire." }],
    },
  ],
});

console.log("✅ All tests passed!");
