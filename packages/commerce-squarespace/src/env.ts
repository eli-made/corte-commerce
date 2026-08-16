/** `process.env` where there is a process, `{}` where there isn't (Workers,
 * browsers). Read lazily — never at module scope, so importing the package
 * never touches the environment. */
export function ambientEnv(): Record<string, string | undefined> {
  const proc = (
    globalThis as { process?: { env?: Record<string, string | undefined> } }
  ).process;
  return proc?.env ?? {};
}
