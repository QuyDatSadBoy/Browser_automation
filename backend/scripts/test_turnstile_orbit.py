"""Test v3: fill ALL required fields then verify Turnstile + submit chain works."""
from __future__ import annotations
import asyncio
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from app.services.browser.session import create_signup_browser_session
from app.services.captcha.capsolver import CapSolver

URL = "https://orbitrings.goaffpro.com/create-account"
SITEKEY = "0x4AAAAAAALRXKa8yBsKwSxF"


def jload(raw):
    if isinstance(raw, str):
        try:
            return json.loads(raw)
        except Exception:
            return {"raw": raw}
    return raw


async def fill_all_fields(page):
    """Fill every required input + select using React setters + dispatch input/change."""
    js = r"""() => {
        const setReact = (el, val) => {
            const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement
                : el.tagName === 'SELECT' ? HTMLSelectElement
                : HTMLInputElement;
            const setter = Object.getOwnPropertyDescriptor(proto.prototype, 'value').set;
            setter.call(el, val);
            el.dispatchEvent(new Event('input', {bubbles:true}));
            el.dispatchEvent(new Event('change', {bubbles:true}));
            el.dispatchEvent(new Event('blur', {bubbles:true}));
        };

        const ts = Date.now();
        const log = [];

        // 1. All inputs by inferred role (placeholder, label, name)
        const inputs = [...document.querySelectorAll('input')];
        for (const el of inputs) {
            if (el.disabled || el.readOnly || el.type === 'hidden') continue;
            const ctx = ((el.placeholder||'') + ' ' + (el.name||'') + ' ' + (el.id||'') + ' ' + (el.getAttribute('aria-label')||'') + ' ' + (el.previousElementSibling?.innerText||'') + ' ' + (el.parentElement?.innerText||'')).toLowerCase().slice(0,200);
            let val = '';
            if (el.type === 'email') val = 'tranquydat09gpt+orbit' + ts + '@gmail.com';
            else if (el.type === 'password') val = 'TestDat@2024!Strong';
            else if (el.type === 'checkbox') { if (!el.checked) el.click(); log.push('CB:'+ctx.slice(0,30)); continue; }
            else if (el.type === 'tel' || /phone/.test(ctx)) val = '5551234567';
            else if (/first/.test(ctx)) val = 'Dat';
            else if (/last/.test(ctx)) val = 'Tran';
            else if (/full.*name|^name|your.*name/.test(ctx)) val = 'Dat Tran';
            else if (/city/.test(ctx)) val = 'Los Angeles';
            else if (/state|province/.test(ctx)) val = 'California';
            else if (/zip|postal/.test(ctx)) val = '90001';
            else if (/address|street/.test(ctx)) val = '123 Main St';
            else if (/website|url/.test(ctx)) val = 'https://example.com';
            else if (/company|business/.test(ctx)) val = 'DatBiz';
            else continue;
            setReact(el, val);
            log.push(el.type + ':' + ctx.slice(0,30) + '=' + val);
        }

        // 2. All selects — pick option matching country/state
        const selects = [...document.querySelectorAll('select')];
        for (const sel of selects) {
            if (sel.disabled) continue;
            const ctx = ((sel.name||'') + ' ' + (sel.id||'') + ' ' + (sel.getAttribute('aria-label')||'') + ' ' + (sel.previousElementSibling?.innerText||'') + ' ' + (sel.parentElement?.innerText||'')).toLowerCase().slice(0,200);
            const opts = [...sel.options].map(o => ({val: o.value, text: (o.text||'').trim()}));
            let pick = null;
            if (/country/.test(ctx)) {
                pick = opts.find(o => /united states|^us$|usa/i.test(o.text)) || opts.find(o => o.val && o.val !== '');
            } else if (/state|province/.test(ctx)) {
                pick = opts.find(o => /california|^ca$/i.test(o.text)) || opts.find(o => o.val && o.val !== '');
            } else {
                pick = opts.find(o => o.val && o.val !== '');
            }
            if (pick) {
                setReact(sel, pick.val);
                log.push('SEL:'+ctx.slice(0,30)+'='+pick.text);
            }
        }
        return JSON.stringify(log);
    }"""
    raw = await page.evaluate(js)
    log = jload(raw)
    print(f"[*] Fields filled ({len(log) if isinstance(log,list) else '?'}):")
    if isinstance(log, list):
        for line in log:
            print("    " + line)


async def run():
    print(f"[*] sitekey={SITEKEY}")
    session = create_signup_browser_session(headless=False, proxy_url=None)
    await session.start()
    try:
        page = await session.get_current_page()
        print(f"[*] Goto {URL}")
        await page.goto(URL)
        await asyncio.sleep(6)

        await fill_all_fields(page)
        await asyncio.sleep(2)

        # Solve Turnstile
        print(f"\n[*] CapSolver solve_turnstile (URL={URL})")
        cs = CapSolver()
        res = await cs.solve_turnstile(URL, SITEKEY)
        token = res["token"]
        ua = res.get("user_agent", "")
        print(f"[+] Token len={len(token)}  ua={ua[:50] if ua else '(none)'}")

        if ua:
            try:
                cdp = await session._get_or_create_cdp_session()
                await cdp.cdp_client.send.Network.setUserAgentOverride(params={"userAgent": ua})
                print("[+] UA overridden")
            except Exception as e:
                print(f"[!] UA override failed: {e}")

        # PostMessage to parent + write to global
        inj_js = """(token) => {
            window.postMessage({type:'turnstile-success', token: token}, '*');
            window.__turnstileToken = token;
            // also set turnstile response inputs/textareas if any
            document.querySelectorAll('input[name="cf-turnstile-response"], textarea[name="cf-turnstile-response"], textarea[name="g-recaptcha-response"]').forEach(el => {
                const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement : HTMLInputElement;
                const setter = Object.getOwnPropertyDescriptor(proto.prototype, 'value').set;
                setter.call(el, token);
                el.dispatchEvent(new Event('input', {bubbles:true}));
                el.dispatchEvent(new Event('change', {bubbles:true}));
            });
            return 'ok';
        }"""
        await page.evaluate(inj_js, token)
        print("[+] Token injected via postMessage + inputs")

        # tick terms if present
        await page.evaluate("""() => {
            const cbs = [...document.querySelectorAll('input[type=checkbox]')];
            for (const cb of cbs) { if (!cb.checked) cb.click(); }
            return cbs.length;
        }""")

        await asyncio.sleep(2)

        btn = jload(await page.evaluate(r"""() => {
            const btns = [...document.querySelectorAll('button')];
            const submit = btns.find(b => /create.*account|sign\s*up|register/i.test(b.textContent));
            return JSON.stringify(submit ? {found:true, disabled: submit.disabled, text: submit.textContent.trim()} : {found:false, all: btns.map(b=>({t:b.textContent.trim(),d:b.disabled}))});
        }"""))
        print(f"[*] Submit button: {btn}")

        if btn.get("found") and not btn.get("disabled"):
            print("[*] Clicking submit...")
            await page.evaluate(r"""() => {
                const submit = [...document.querySelectorAll('button')].find(b => /create.*account|sign\s*up|register/i.test(b.textContent));
                if (submit) submit.click();
            }""")
            await asyncio.sleep(10)
        else:
            print("[!] Submit still disabled — Turnstile postMessage may not have unlocked the form")
            print("    Re-trying with mock turnstile widget object...")
            await page.evaluate("""(token) => {
                // Some apps poll window.turnstile.getResponse()
                window.turnstile = window.turnstile || {};
                window.turnstile.getResponse = () => token;
                window.turnstile.execute = () => token;
                // Try invoke onTurnstileSuccess globally if defined
                if (typeof window.onTurnstileSuccess === 'function') {
                    try { window.onTurnstileSuccess(token); } catch(e){}
                }
            }""", token)
            await asyncio.sleep(3)
            btn2 = jload(await page.evaluate(r"""() => {
                const submit = [...document.querySelectorAll('button')].find(b => /create.*account|sign\s*up|register/i.test(b.textContent));
                return JSON.stringify(submit ? {disabled: submit.disabled} : {none:true});
            }"""))
            print(f"[*] After retry: {btn2}")
            if btn2.get("disabled") is False:
                await page.evaluate(r"""() => {
                    const submit = [...document.querySelectorAll('button')].find(b => /create.*account|sign\s*up|register/i.test(b.textContent));
                    if (submit) submit.click();
                }""")
                await asyncio.sleep(10)

        final = jload(await page.evaluate(r"""() => {
            const t = (document.body && document.body.innerText || '');
            return JSON.stringify({
                url: location.href,
                has_failed: /verification failed/i.test(t),
                has_success: /verify your email|check your email|account created|welcome|dashboard|approved|thank/i.test(t),
                title: document.title,
                snippet: t.slice(0, 400),
            });
        }"""))
        print(f"\n[+] FINAL: {json.dumps(final, indent=2)[:800]}")
        return bool(final.get("has_success")) or final.get("url") != URL
    finally:
        print("\n[*] Browser open 90s for inspection (Ctrl+C to skip).")
        try:
            await asyncio.sleep(90)
        except KeyboardInterrupt:
            pass
        try:
            await session.stop()
        except Exception:
            pass


if __name__ == "__main__":
    ok = asyncio.run(run())
    print(f"\nRESULT: {'PASS' if ok else 'FAIL'}")
    sys.exit(0 if ok else 1)
