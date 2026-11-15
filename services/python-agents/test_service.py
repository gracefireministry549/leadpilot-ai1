from __future__ import annotations

import io
import json
import os
import unittest
from email.message import Message
from unittest.mock import patch

from service import Handler, MAX_BODY_BYTES


class Harness(Handler):
    def send_json(self, status, body):
        self.response = (status, body)


def make_handler(payload: bytes = b'{}', secret: str = '', path: str = '/run') -> Harness:
    handler = Harness.__new__(Harness)
    handler.path = path
    handler.headers = Message()
    handler.headers['Content-Length'] = str(len(payload))
    if secret:
        handler.headers['X-LeadPilot-Worker-Secret'] = secret
    handler.rfile = io.BytesIO(payload)
    handler.response = None
    return handler


class WorkerSecurityTests(unittest.TestCase):
    def test_rejects_missing_secret(self):
        handler = make_handler()
        with patch.dict(os.environ, {'PYTHON_AGENT_SECRET': 'expected-secret'}):
            handler.do_POST()
        self.assertEqual(handler.response[0], 401)

    def test_rejects_wrong_secret(self):
        handler = make_handler(secret='wrong-secret')
        with patch.dict(os.environ, {'PYTHON_AGENT_SECRET': 'expected-secret'}):
            handler.do_POST()
        self.assertEqual(handler.response[0], 401)

    def test_fails_closed_when_server_secret_is_missing(self):
        handler = make_handler(secret='anything')
        with patch.dict(os.environ, {}, clear=True):
            handler.do_POST()
        self.assertEqual(handler.response[0], 401)

    def test_rejects_oversized_request(self):
        handler = make_handler(payload=b'x' * (MAX_BODY_BYTES + 1), secret='expected-secret')
        with patch.dict(os.environ, {'PYTHON_AGENT_SECRET': 'expected-secret'}):
            handler.do_POST()
        self.assertEqual(handler.response[0], 413)

    def test_accepts_valid_authenticated_request(self):
        payload = json.dumps({'agent': 'website-brand', 'query': 'Local bakery website'}).encode()
        handler = make_handler(payload=payload, secret='expected-secret')
        with patch.dict(os.environ, {'PYTHON_AGENT_SECRET': 'expected-secret'}):
            handler.do_POST()
        status, body = handler.response
        self.assertEqual(status, 200)
        self.assertEqual(body['agent'], 'website-brand')
        self.assertTrue(body['results'])


if __name__ == '__main__':
    unittest.main()
