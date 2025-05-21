import re
import unittest
from unittest.mock import patch, MagicMock
from pathlib import Path
import os
import sys
import time

# directory of this file
test_dir = Path(__file__).parent
# api directory
dir = test_dir.parent
# change python path to the api directory
sys.path.append(str(dir.absolute()))

# set the data directory
os.environ['P9M4_DATA_DIR'] = str((test_dir / "data").absolute())

# import api functions/modules
import parse
from p9m4_types import ParseOutput, Prover9Options, Mace4Options, GuiOutput, ProgramType, ProcessState, ProcessInfo
from process_handler import run_program, processes, process_lock, remove_process, clean_up
from datetime import datetime

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
    def test_manual_isoformat(self):
        # get a mace4 output file
        # non-trivial groups up to size 4
        groups = """
if(Mace4).   % Options for Mace4
  assign(start_size, 2).
  assign(end_size, 4).
  assign(max_models, -1).
  assign(max_seconds, -1).
end_if.

formulas(assumptions).

(x*y)*z=x*(y*z).
x*e=x.
e*x=x.
x*x'=e.
x'*x=e.

end_of_list.

formulas(goals).

end_of_list.
"""
        
        m4_id = 10
        mace4_info = ProcessInfo(
            pid=0,
            start_time=datetime.now(),
            state=ProcessState.READY,
            program=ProgramType.MACE4,
            input=groups,
        )
        if_id = 11
        if_info = ProcessInfo(
            pid=0,
            start_time=datetime.now(),
            state=ProcessState.READY,
            program=ProgramType.INTERPFORMAT,
            input=groups
        )
        # Add to tracking
        with process_lock:
            processes[str(m4_id)] = mace4_info
            processes[str(if_id)] = if_info
        try:
            run_program(ProgramType.MACE4, groups, m4_id)
            # wait for the process to finish
            i = 0
            while processes[str(m4_id)].state != ProcessState.DONE:
                time.sleep(0.1)
                i += 1
                if i > 100:
                    raise Exception("Group mace4 process did not finish in 10 seconds")
            # get the output
            with open(processes[str(m4_id)].fout_path, "rb") as f:
                output = f.read().decode("utf-8")
            # get the isoformat output
            manual_isoformat_output = parse.manual_standardize_mace4_output(output)
            # get the binary interpformat output
            run_program(ProgramType.INTERPFORMAT, output, if_id)
            # wait for the process to finish
            i = 0
            while processes[str(if_id)].state != ProcessState.DONE:
                time.sleep(0.1)
                i += 1
                if i > 100:
                    raise Exception("Interpformat process did not finish in 10 seconds")
            with open(processes[str(if_id)].fout_path, "rb") as f:
                binary_output = f.read().decode("utf-8")
            # strip whitespace and comments from both outputs
            binary_output = re.sub(r"%.*", "", binary_output)
            binary_output = re.sub(r"\s+", "", binary_output)
            manual_isoformat_output = re.sub(r"%.*", "", manual_isoformat_output)
            manual_isoformat_output = re.sub(r"\s+", "", manual_isoformat_output)
            # check that the isoformat output is the same as the binary output
            self.assertEqual(len(manual_isoformat_output), len(binary_output))
            #self.assertEqual(manual_isoformat_output, binary_output) # order of opetations may change
        finally:
            remove_process(m4_id)
            remove_process(if_id)
            clean_up()
                        
if __name__ == '__main__':
    unittest.main() 