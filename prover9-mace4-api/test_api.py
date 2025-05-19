import re
import unittest
import requests
import time
from unittest.mock import patch, MagicMock
import os
from pathlib import Path

from p9m4_types import ParseOutput, Prover9Options, Mace4Options
# # make sure the api is running?
# app.run(debug=True)

# path of this file
path = Path(__file__).parent

class TestQuickProver9(unittest.TestCase):
    def setUp(self):
        self.base_url = "http://localhost:8000"
        with open(path / "samples/Equality/Prover9/CL-SK-W.in", "r") as file:
            self.prover9_input = file.read()
        self.response = requests.post(f"{self.base_url}/start", json={
            "program": "prover9",
            "input": self.prover9_input
        })
        assert self.response.status_code == 200
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
        with open(path / "samples/GT_Sax.in", "r") as file:
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
        
        # Pause process if not running on windows
        if os.name == "nt":
            pause_response = requests.post(f"{self.base_url}/pause/{self.process_id}")
            # pause should not be allowed on windows
            self.assertNotEqual(pause_response.status_code, 200)
        else:
            pause_response = requests.post(f"{self.base_url}/pause/{self.process_id}")
            self.assertEqual(pause_response.status_code, 200)
        
        # Resume process if not running on windows
        if os.name == "nt":
            resume_response = requests.post(f"{self.base_url}/resume/{self.process_id}")
            self.assertNotEqual(resume_response.status_code, 200)
        else:
            resume_response = requests.post(f"{self.base_url}/resume/{self.process_id}")
            self.assertEqual(resume_response.status_code, 200)
        
        # Kill process
        kill_response = requests.post(f"{self.base_url}/kill/{self.process_id}")
        self.assertEqual(kill_response.status_code, 200)

class TestMace4(unittest.TestCase):
    def setUp(self):
        self.base_url = "http://localhost:8000"
        with open(path / "samples/Equality/Mace4/CL-QL.in", "r") as file:
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
            if i > 7:
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
            if i > 7:
                raise Exception("Isofilter process did not finish quickly")
        
        response = requests.delete(f"{self.base_url}/process/{process_id}")
        self.assertEqual(response.status_code, 200)

class TestParser(unittest.TestCase):
    # should be able to parse all the samples
    def test_parse_all_samples(self):
        dir = Path("samples")
        # walk through direcory and subdirectories
        for file in dir.glob("**/*"):
            if file.is_file():
                # check if the file is a prover9 input file
                if file.name.endswith(".in"):
                    with open(file, "r") as f:
                        prover9_input = f.read()
                        response = requests.post(f"{self.base_url}/parse", json={
                            "input": prover9_input
                        })
                        self.assertEqual(response.status_code, 200)
                        output = response.json()
                        self.assertIsInstance(output, ParseOutput)
                        self.assertIsInstance(output.prover9_options, Prover9Options)
                        self.assertIsInstance(output.mace4_options, Mace4Options)
                        # check that generateInput is the inverse of parse
                        response = requests.post(f"{self.base_url}/generateInput", json=output)
                        self.assertEqual(response.status_code, 200)
                        generated_input = response.json()
                        no_comments = re.sub(r"%.*", "", generated_input)
                        no_comments_output = re.sub(r"%.*", "", prover9_input)
                        self.assertEqual(no_comments, no_comments_output)
                        
        
        
if __name__ == '__main__':
    unittest.main() 