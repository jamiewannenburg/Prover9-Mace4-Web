import re
import unittest
import requests
import time
from unittest.mock import patch, MagicMock
import os
import sys
from pathlib import Path


# directory of this file
test_dir = Path(__file__).parent
# api directory
dir = test_dir.parent
# change python path to the api directory
sys.path.append(str(dir.absolute()))

# set the data directory
os.environ['P9M4_DATA_DIR'] = str((test_dir / "data").absolute())


from p9m4_types import ParseOutput, Prover9Options, Mace4Options
# # make sure the api is running?
# app.run(debug=True)

class TestQuickProver9(unittest.TestCase):
    def setUp(self):
        self.base_url = "http://localhost:8000"
        with open(dir / "samples/Equality/Prover9/CL-SK-W.in", "r") as file:
            self.prover9_input = file.read()
        self.response = requests.post(f"{self.base_url}/start", json={
            "program": "prover9",
            "input": self.prover9_input
        })
        self.process_id = self.response.json()["process_id"]
        while requests.get(f"{self.base_url}/status/{self.process_id}").json()["state"] != "done":
            time.sleep(1)
        self.status = requests.get(f"{self.base_url}/status/{self.process_id}").json()
        self.output = requests.get(f"{self.base_url}/output/{self.process_id}").json()
        
    def tearDown(self):
        requests.delete(f"{self.base_url}/process/{self.process_id}")

    def test_start_prover9_process(self):
        self.assertEqual(self.response.status_code, 200)
        self.assertIn("process_id", self.response.json())

    def test_get_status(self):
        self.assertIn("state", self.status)
        self.assertEqual(self.status["state"], "done")
        self.assertIn("output", self.output)
        self.assertIn("THEOREM PROVED", self.output["output"])

    def test_list_processes(self):
        response = requests.get(f"{self.base_url}/processes")
        self.assertEqual(response.status_code, 200)
        self.assertIsInstance(response.json(), list)
        self.assertIn(self.process_id, response.json())


    def test_prooftrans(self):
        prover9_output = self.output["output"]
        
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
            if i > 35:
                raise Exception("Prooftrans process did not finish quickly")
        
        response = requests.delete(f"{self.base_url}/process/{process_id}")
        self.assertEqual(response.status_code, 200)



class TestLongRunningProver9(unittest.TestCase):
    def setUp(self):
        self.base_url = "http://localhost:8000"
        with open(dir / "samples/GT_Sax.in", "r") as file:
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
        with open(dir / "samples/Equality/Mace4/CL-QL.in", "r") as file:
            self.mace4_input = file.read()
        self.response = requests.post(f"{self.base_url}/start", json={
            "program": "mace4",
            "input": self.mace4_input
        })
        self.process_id = self.response.json()["process_id"]
        while requests.get(f"{self.base_url}/status/{self.process_id}").json()["state"] != "done":
            time.sleep(1)
        self.status = requests.get(f"{self.base_url}/status/{self.process_id}").json()
        self.output = requests.get(f"{self.base_url}/output/{self.process_id}").json()
    
    def tearDown(self):
        requests.delete(f"{self.base_url}/process/{self.process_id}")

    def test_start_mace4_process(self):
        self.assertEqual(self.response.status_code, 200)
        self.assertIn("process_id", self.response.json())

    def test_get_status(self):
        self.assertIn("state", self.status)
        self.assertEqual(self.status["state"], "done")
        self.assertIn("output", self.output)
        self.assertIn("MODEL", self.output["output"])

    def test_interpformat(self):
        # Run interpformat
        # Wait for Mace4 to finish
        mace4_output = self.output["output"]
        
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
        mace4_output = self.output["output"]
        
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
    def setUp(self):
        self.base_url = "http://localhost:8000"
    # should be able to parse all the samples
    def test_parse_all_samples(self):
        samples_dir = dir / "samples"
        # walk through direcory and subdirectories
        for file in samples_dir.glob("**/*"):
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
                        output = ParseOutput(**output)
                        self.assertIsInstance(output, ParseOutput)
                        self.assertIsInstance(output.prover9_options, Prover9Options)
                        self.assertIsInstance(output.mace4_options, Mace4Options)
                        
        
        
if __name__ == '__main__':
    unittest.main() 