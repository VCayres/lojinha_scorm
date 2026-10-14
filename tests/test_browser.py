"""Browser smoke tests. Requires Playwright and Chromium, not needed by the SCO."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
import json
import os
import shutil
import unittest
import xml.etree.ElementTree as ET
from zipfile import ZipFile

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
LMS_HTML = b'''<!doctype html><html><head><title>LMS test fixture</title></head><body>
<script>
window.calls=[];
window.values=JSON.parse(sessionStorage.getItem('lms-values')||'{"cmi.core.lesson_status":"not attempted"}');
window.rejectCommit=false; window.rejectSet=false; window.rejectInit=false;
let initialized=false, lastError='0';
window.API={
 LMSInitialize(arg) { calls.push(['initialize',arg]); if (window.rejectInit) return 'false'; initialized=true; return 'true'; },
 LMSGetValue(key) { calls.push(['get',key]); lastError=initialized?'0':'301'; return values[key]||''; },
 LMSGetLastError() { return lastError; },
 LMSSetValue(key,value) { calls.push(['set',key,value]); if(!initialized || window.rejectSet) return 'false'; values[key]=value; return 'true'; },
 LMSCommit(arg) { calls.push(['commit',arg]); if(!initialized || window.rejectCommit) return 'false'; sessionStorage.setItem('lms-values',JSON.stringify(values)); return 'true'; },
 LMSFinish(arg) { calls.push(['finish',arg]); initialized=false; return 'true'; }
};
</script><iframe id="sco" src="/index.html" style="width:100%;height:100vh;border:0" title="SCO"></iframe>
</body></html>'''

class Handler(SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path == '/__lms__':
            self.send_response(200)
            self.send_header('Content-Type', 'text/html; charset=utf-8')
            self.send_header('Content-Length', str(len(LMS_HTML)))
            self.end_headers()
            self.wfile.write(LMS_HTML)
        else:
            super().do_GET()

    def log_message(self, *_):
        pass

class BrowserTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = ThreadingHTTPServer(('127.0.0.1', 0), partial(Handler, directory=str(ROOT)))
        cls.thread = Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.url = f'http://127.0.0.1:{cls.server.server_port}'
        cls.playwright = sync_playwright().start()
        executable = os.environ.get('CHROMIUM_EXECUTABLE') or shutil.which('chromium') or shutil.which('google-chrome')
        cls.browser = cls.playwright.chromium.launch(executable_path=executable, headless=True, args=['--no-sandbox'])

    @classmethod
    def tearDownClass(cls):
        cls.browser.close()
        cls.playwright.stop()
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join()

    def setUp(self):
        self.context = self.browser.new_context(viewport={'width': 1366, 'height': 1000})
        self.page = self.context.new_page()
        self.errors = []
        self.page.on('pageerror', lambda e: self.errors.append(str(e)))

    def tearDown(self):
        self.context.close()
        self.assertEqual(self.errors, [], 'Unexpected JavaScript errors')

    def open(self, lms=False):
        self.page.goto(self.url + ('/__lms__' if lms else '/index.html'))
        frame = self.page.frame_locator('#sco') if lms else self.page
        frame.locator('.product-card').last.wait_for()
        self.assertEqual(frame.locator('.product-card').count(), 25)
        return frame

    def add(self, frame, name):
        frame.get_by_role('button', name=f'Adicionar {name} ao carrinho', exact=True).click()

    def check_money(self, frame, selector, expected):
        self.assertEqual(frame.locator(selector).inner_text().replace('\xa0', ' '), expected)

    def test_catalog_cart_tax_receipt_and_print(self):
        frame = self.open()
        self.assertTrue(frame.locator('#checkout-btn').is_disabled())
        self.add(frame, 'Bola')
        self.add(frame, 'Bola')
        self.add(frame, 'Caderno')
        self.check_money(frame, '#cart-total', 'R$ 90,00')
        frame.locator('#checkout-btn').click()
        self.assertEqual(frame.locator('#nf-itens tr').count(), 2)
        self.check_money(frame, '#nf-impostos', 'R$ 18,00')
        self.check_money(frame, '#nf-total', 'R$ 90,00')
        self.page.emulate_media(media='print')
        self.assertFalse(frame.locator('.app').is_visible())
        self.assertFalse(frame.locator('.nf-acoes').is_visible())
        self.assertTrue(frame.locator('.nf-table').is_visible())
        self.page.emulate_media(media='screen')
        frame.locator('#complete-btn').click()
        self.assertIn('Atividade concluída', frame.locator('#activity-status').inner_text())
        self.assertTrue(frame.locator('#complete-btn').is_disabled())
        (ROOT / 'dist').mkdir(exist_ok=True)
        self.page.screenshot(path=str(ROOT / 'dist' / 'nota-desktop.png'))
        frame.locator('#nf-close').click()
        self.page.locator('img').evaluate_all("images=>images.forEach(image=>image.loading='eager')")
        self.page.wait_for_function("Array.from(document.images).every(image=>image.complete && image.naturalWidth > 0)")
        self.page.screenshot(path=str(ROOT / 'dist' / 'lojinha-desktop.png'), full_page=True)

    def test_local_resume_and_receipt_snapshot(self):
        frame = self.open()
        self.add(frame, 'Boné')
        frame.locator('#checkout-btn').click()
        number = frame.locator('#nf-numero').inner_text()
        self.page.reload()
        self.check_money(self.page, '#cart-total', 'R$ 20,00')
        self.page.locator('#checkout-btn').click()
        self.assertEqual(self.page.locator('#nf-numero').inner_text(), number)
        self.page.locator('#nf-close').click()
        self.add(self.page, 'Caderno')
        saved = self.page.evaluate("JSON.parse(localStorage.getItem('lojinha-do-ed-scorm-v1'))")
        self.assertIsNone(saved['receipt'])
        self.check_money(self.page, '#cart-total', 'R$ 30,00')

    def test_scorm_progress_resume_completion_and_finish(self):
        frame = self.open(lms=True)
        self.assertEqual(self.page.evaluate("values['cmi.core.lesson_status']"), 'incomplete')
        self.add(frame, 'Celular')
        self.add(frame, 'Feijão 1Kg')
        saved = json.loads(self.page.evaluate("values['cmi.suspend_data']"))
        self.assertEqual(saved['cart'], [[7, 1], [19, 1]])
        self.assertLess(len(json.dumps(saved)), 4096)
        self.assertEqual(self.page.evaluate("values['cmi.core.exit']"), 'suspend')
        self.page.reload()
        frame = self.page.frame_locator('#sco')
        self.check_money(frame, '#cart-total', 'R$ 1.508,00')
        frame.locator('#checkout-btn').click()
        self.assertEqual(self.page.evaluate("values['cmi.core.lesson_location']"), 'receipt')
        frame.locator('#complete-btn').click()
        self.assertEqual(self.page.evaluate("values['cmi.core.lesson_status']"), 'completed')
        self.assertEqual(self.page.evaluate("values['cmi.core.exit']"), '')
        self.assertFalse(self.page.evaluate("Object.keys(values).some(k=>k.startsWith('cmi.core.score'))"))
        self.page.reload()
        frame = self.page.frame_locator('#sco')
        self.assertIn('Atividade concluída', frame.locator('#activity-status').inner_text())
        sco = self.page.frame(url=self.url + '/index.html')
        sco.evaluate("window.dispatchEvent(new PageTransitionEvent('pagehide'))")
        self.assertEqual(self.page.evaluate("calls.filter(c=>c[0]==='finish').length"), 1)
        self.assertRegex(self.page.evaluate("values['cmi.core.session_time']"), r'^\d{4}:\d{2}:\d{2}\.\d{2}$')
        self.assertEqual(self.page.evaluate('calls[0][0]'), 'initialize')
        self.assertEqual(self.page.evaluate('calls[calls.length-1][0]'), 'finish')

    def test_lms_commit_failure_is_visible_and_retryable(self):
        frame = self.open(lms=True)
        self.page.evaluate('window.rejectCommit=true')
        self.add(frame, 'Bola')
        self.assertIn('não confirmou o salvamento', frame.locator('#connection-status').inner_text())
        self.assertIn('pendente', frame.locator('#activity-status').inner_text())
        self.assertTrue(frame.locator('#retry-save').is_visible())
        self.page.evaluate('window.rejectCommit=false')
        frame.locator('#retry-save').click()
        self.assertFalse(frame.locator('#retry-save').is_visible())
        self.assertIn('Conectado ao LMS', frame.locator('#connection-status').inner_text())

    def test_lms_set_failure_is_not_silently_successful(self):
        frame = self.open(lms=True)
        self.page.evaluate('window.rejectSet=true')
        self.add(frame, 'Bola')
        self.assertIn('pendente', frame.locator('#activity-status').inner_text())
        self.assertTrue(frame.locator('#retry-save').is_visible())
        self.page.evaluate('window.rejectSet=false')
        frame.locator('#retry-save').click()
        self.assertFalse(frame.locator('#retry-save').is_visible())

    def test_mobile_drawer_keyboard_and_layout(self):
        self.page.set_viewport_size({'width': 390, 'height': 844})
        frame = self.open()
        self.add(frame, 'Banana')
        frame.locator('#mobile-cart-open').click()
        self.assertTrue(frame.locator('#drawer').is_visible())
        frame.get_by_role('button', name='Aumentar quantidade de Banana', exact=True).last.click()
        self.check_money(frame, '#drawer-total', 'R$ 10,00')
        self.page.keyboard.press('Escape')
        self.assertFalse(frame.locator('#drawer').is_visible())
        self.assertEqual(self.page.evaluate('document.activeElement.id'), 'mobile-cart-open')
        frame.locator('#mobile-checkout-btn').click()
        self.check_money(frame, '#nf-impostos', 'R$ 2,00')
        self.assertLessEqual(self.page.evaluate('document.documentElement.scrollWidth'), 390)
        frame.locator('#complete-btn').click()
        self.assertIn('Atividade concluída', frame.locator('#receipt-status').inner_text())
        self.page.screenshot(path=str(ROOT / 'dist' / 'nota-mobile.png'))
        self.page.keyboard.press('Escape')
        self.assertFalse(frame.locator('#receipt-modal').is_visible())

    def test_corrupted_saved_data_is_ignored(self):
        self.context.add_init_script("localStorage.setItem('lojinha-do-ed-scorm-v1', JSON.stringify({version:1,cart:[[999,2]],receipt:null,completed:false}));")
        frame = self.open()
        self.check_money(frame, '#cart-total', 'R$ 0,00')
        self.add(frame, 'Tomate')
        self.check_money(frame, '#cart-total', 'R$ 7,00')

    def test_all_images_load_without_external_requests(self):
        requests = []
        self.page.on('request', lambda request: requests.append(request.url))
        frame = self.open()
        frame.locator('img').evaluate_all("images=>images.forEach(image=>image.loading='eager')")
        self.page.wait_for_function("Array.from(document.images).every(image=>image.complete && image.naturalWidth > 0)")
        self.assertTrue(all(url.startswith(self.url) for url in requests))
        self.assertEqual(frame.locator('.header').evaluate("e=>getComputedStyle(e).backgroundImage"), f'url("{self.url}/assets/27.lojinha.png")')

    def test_package_integrity_and_manifest_references(self):
        from scripts.package_scorm import build
        package = build()
        ns = {'ims': 'http://www.imsproject.org/xsd/imscp_rootv1p1p2', 'adlcp': 'http://www.adlnet.org/xsd/adlcp_rootv1p2'}
        with ZipFile(package) as archive:
            self.assertIsNone(archive.testzip())
            manifest = ET.fromstring(archive.read('imsmanifest.xml'))
            resource = manifest.find('.//ims:resource', ns)
            self.assertEqual(resource.attrib['{'+ns['adlcp']+'}scormtype'], 'sco')
            self.assertEqual(resource.attrib['href'], 'index.html')
            expected = {entry.attrib['href'] for entry in resource.findall('ims:file', ns)} | {'imsmanifest.xml'}
            self.assertEqual(set(archive.namelist()), expected)
            self.assertEqual(len(expected), 32)
            self.assertNotIn('tests/test_browser.py', expected)

if __name__ == '__main__':
    unittest.main(verbosity=2)
