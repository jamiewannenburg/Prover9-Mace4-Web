import re
import unittest
from unittest.mock import patch, MagicMock
from pathlib import Path
import parse
from p9m4_types import ParseOutput, Prover9Options, Mace4Options, GuiOutput
# directory of this file
dir = Path(__file__).parent

class TestParser(unittest.TestCase):
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
                        output = parse.parse_string(prover9_input)
                        self.assertIsInstance(output, ParseOutput)
                        self.assertIsInstance(output.prover9_options, Prover9Options)
                        self.assertIsInstance(output.mace4_options, Mace4Options)
                        # concatinate global parameters and flags as additional input
                        additional_input = ""
                        for param in output.global_parameters:
                            additional_input += f"assign({param.name}, {param.value}).\n"
                        for flag in output.global_flags:
                            if flag.value:
                                additional_input += f"set({flag.name}).\n"
                            else:
                                additional_input += f"clear({flag.name}).\n"
                                
                        gui_output = GuiOutput(
                            assumptions=output.assumptions,
                            goals=output.goals,
                            additional_input=additional_input,
                            prover9_options=output.prover9_options,
                            mace4_options=output.mace4_options,
                            language_options=output.language_options
                        )
                        # TODO: check that generateInput is the inverse of parse
                        generated_input = parse.generate_input(gui_output)
                        # no_comments = re.sub(r"%.*", "", generated_input)
                        # no_comments_output = re.sub(r"%.*", "", prover9_input)
                        # self.assertEqual(no_comments, no_comments_output)
                        
if __name__ == '__main__':
    unittest.main() 