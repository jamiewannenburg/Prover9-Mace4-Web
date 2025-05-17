import re
import unittest
from unittest.mock import patch, MagicMock
from pathlib import Path
import parse
from p9m4_types import ParseOutput, Prover9Options, Mace4Options

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
                        output = parse.parse_string(prover9_input)
                        self.assertIsInstance(output, ParseOutput)
                        self.assertIsInstance(output.prover9_options, Prover9Options)
                        self.assertIsInstance(output.mace4_options, Mace4Options)
                        # check that generateInput is the inverse of parse
                        generated_input = parse.generate_input(output)
                        no_comments = re.sub(r"%.*", "", generated_input)
                        no_comments_output = re.sub(r"%.*", "", prover9_input)
                        self.assertEqual(no_comments, no_comments_output)
                        
if __name__ == '__main__':
    unittest.main() 