import unittest
import requests
import time
from unittest.mock import patch, MagicMock

class TestQuickProver9(unittest.TestCase):
    def setUp(self):
        self.base_url = "http://localhost:8000"
        with open("Samples/Equality/Prover9/CL-SK-W.in", "r") as file:
            self.prover9_input = file.read()
        self.response = requests.post(f"{self.base_url}/start", json={
            "program": "prover9",
            "input": self.prover9_input
        })
        self.process_id = self.response.json()["process_id"]
        while requests.get(f"{self.base_url}/status/{self.process_id}").json()["state"] != "done":
            time.sleep(1)
        self.status = requests.get(f"{self.base_url}/status/{self.process_id}").json()
        
    def tearDown(self):
        requests.delete(f"{self.base_url}/process/{self.process_id}")

    def test_start_prover9_process(self):
        self.assertEqual(self.response.status_code, 200)
        self.assertIn("process_id", self.response.json())

    def test_get_status(self):
        self.assertIn("state", self.status)
        self.assertEqual(self.status["state"], "done")
        self.assertIn("output", self.status)
        self.assertIn("THEOREM PROVED", self.status["output"])

    def test_list_processes(self):
        response = requests.get(f"{self.base_url}/processes")
        self.assertEqual(response.status_code, 200)
        self.assertIsInstance(response.json(), list)
        self.assertIn(self.process_id, response.json())


    def test_prooftrans(self):
        prover9_output = self.status["output"]
        
        # Run prooftrans
        response = requests.post(f"{self.base_url}/start", json={
            "program": "prooftrans",
            "input": prover9_output,
            "options": {
                "format": "xml",
                "expand": True,
                "renumber": True
            }
        })
        self.assertEqual(response.status_code, 200)
        self.assertIn("process_id", response.json())
        process_id = response.json()["process_id"]
        i = 0
        while requests.get(f"{self.base_url}/status/{process_id}").json()["state"] != "done":
            time.sleep(1)
            i += 1
            if i > 3:
                raise Exception("Prooftrans process did not finish quickly")
        
        response = requests.delete(f"{self.base_url}/process/{process_id}")
        self.assertEqual(response.status_code, 200)



class TestLongRunningProver9(unittest.TestCase):
    def setUp(self):
        self.base_url = "http://localhost:8000"
        with open("Samples/GT_Sax.in", "r") as file:
            self.long_running_input = file.read()
        self.response = requests.post(f"{self.base_url}/start", json={
            "program": "prover9",
            "input": self.long_running_input
        })
        self.process_id = self.response.json()["process_id"]

    def tearDown(self):
        requests.delete(f"{self.base_url}/process/{self.process_id}")

    def test_process_lifecycle(self):
        status = requests.get(f"{self.base_url}/status/{self.process_id}").json()
        self.assertIn("state", status)
        while status["state"] == "ready":
            time.sleep(1)
            status = requests.get(f"{self.base_url}/status/{self.process_id}").json()
        self.assertIn("state", status)
        self.assertEqual(status["state"], "running")
        
        # Pause process
        pause_response = requests.post(f"{self.base_url}/pause/{self.process_id}")
        self.assertEqual(pause_response.status_code, 200)
        
        # Resume process
        resume_response = requests.post(f"{self.base_url}/resume/{self.process_id}")
        self.assertEqual(resume_response.status_code, 200)
        
        # Kill process
        kill_response = requests.post(f"{self.base_url}/kill/{self.process_id}")
        self.assertEqual(kill_response.status_code, 200)

class TestMace4(unittest.TestCase):
    def setUp(self):
        self.base_url = "http://localhost:8000"
        with open("Samples/Equality/Mace4/CL-QL.in", "r") as file:
            self.mace4_input = file.read()
        self.response = requests.post(f"{self.base_url}/start", json={
            "program": "mace4",
            "input": self.mace4_input
        })
        self.process_id = self.response.json()["process_id"]
        while requests.get(f"{self.base_url}/status/{self.process_id}").json()["state"] != "done":
            time.sleep(1)
        self.status = requests.get(f"{self.base_url}/status/{self.process_id}").json()
        
    def tearDown(self):
        requests.delete(f"{self.base_url}/process/{self.process_id}")

    def test_start_mace4_process(self):
        self.assertEqual(self.response.status_code, 200)
        self.assertIn("process_id", self.response.json())

    def test_get_status(self):
        self.assertIn("state", self.status)
        self.assertEqual(self.status["state"], "done")
        self.assertIn("output", self.status)
        self.assertIn("MODEL", self.status["output"])

    def test_interpformat(self):
        # Run interpformat
        # Wait for Mace4 to finish
        mace4_output = self.status["output"]
        
        # Run interpformat
        response = requests.post(f"{self.base_url}/start", json={
            "program": "interpformat",
            "input": mace4_output,
            "options": {
                "format": "standard"
            }
        })
        self.assertEqual(response.status_code, 200)
        self.assertIn("process_id", response.json())
        process_id = response.json()["process_id"]
        i = 0
        while requests.get(f"{self.base_url}/status/{process_id}").json()["state"] != "done":
            time.sleep(3)
            i += 1
            if i > 3:
                raise Exception("Interpformat process did not finish quickly")
        
        response = requests.delete(f"{self.base_url}/process/{process_id}")
        self.assertEqual(response.status_code, 200)

    def test_isofilter(self):
        mace4_output = self.status["output"]
        
        # Run isofilter
        response = requests.post(f"{self.base_url}/start", json={
            "program": "isofilter",
            "input": mace4_output,
            "options": {
                "wrap": True,
                "ignore_constants": True,
            }
        })
        self.assertEqual(response.status_code, 200)
        self.assertIn("process_id", response.json())
        process_id = response.json()["process_id"]
        i = 0
        while requests.get(f"{self.base_url}/status/{process_id}").json()["state"] != "done":
            time.sleep(1)
            i += 1
            if i > 3:
                raise Exception("Isofilter process did not finish quickly")
        
        response = requests.delete(f"{self.base_url}/process/{process_id}")
        self.assertEqual(response.status_code, 200)

        
if __name__ == '__main__':
    unittest.main() 