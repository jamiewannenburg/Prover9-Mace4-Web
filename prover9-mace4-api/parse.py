
from pyparsing import (
    Word, alphas, alphanums, Literal, Group, Optional, 
    OneOrMore, ZeroOrMore, ParseException, restOfLine,
    QuotedString, delimitedList, ParseResults, Regex, Keyword, OneOrMore, printables
)
from p9m4_types import (
    ParseOutput, Parameter, Flag, Mace4Options, Prover9Options
)


# Define basic tokens
period = Literal(".")
identifier = Word(alphanums+"_")
quoted_string = QuotedString('"', escChar='\\')

# Define comment
comment = Group(Literal("%") + restOfLine)

# Define option patterns
set_option = Group(Literal("set")+ Literal("(").suppress() + (identifier | quoted_string) + Literal(")").suppress() + period)+Optional(comment)
clear_option = Group(Literal("clear")+ Literal("(").suppress() + (identifier | quoted_string) + Literal(")").suppress() + period)+Optional(comment)
assign_option = Group(Literal("assign")+ Literal("(").suppress() + (identifier | quoted_string) + Literal(",").suppress() + (Word(alphanums+"_"+'-') | quoted_string) + Literal(")").suppress() + period)+Optional(comment)
language_option = Group(Literal("op")+ Literal("(").suppress() + (identifier | quoted_string) + ZeroOrMore(Literal(",").suppress() + (Word(alphanums+"_"+'-') | quoted_string)) + Literal(")").suppress() + period)+Optional(comment)

# Define section markers
formulas_assumptions = Group(Literal("formulas(assumptions)") + period)+Optional(comment)
formulas_goals = Group(Literal("formulas(goals)") + period)+Optional(comment)
end_of_list = Group(Literal("end_of_list") + period)+Optional(comment)

# Define program blocks
if_prover9 = Group(Literal("if(Prover9)") + period)+Optional(comment)
if_mace4 = Group(Literal("if(Mace4)") + period)+Optional(comment)
end_if = Group(Literal("end_if") + period)+Optional(comment)

# Define formula (anything ending with period, excluding comments and special markers)
formula =  Group(~(end_of_list)+Word(printables)+restOfLine) #| if_prover9 | if_mace4 | end_if formulas_assumptions | formulas_goals |

# Define sections
assumptions_section = formulas_assumptions + ZeroOrMore(formula, stop_on=end_of_list) + end_of_list
goals_section = formulas_goals + ZeroOrMore(formula, stop_on=end_of_list) + end_of_list

# Define program blocks
prover9_block = if_prover9 + ZeroOrMore(comment | set_option | assign_option | clear_option) + end_if
mace4_block = if_mace4 + ZeroOrMore(comment | set_option | assign_option | clear_option) + end_if

# Define global options
#global_flags = ZeroOrMore(set_option | assign_option | clear_option)

# Define the complete grammar 
#grammar = Optional(ZeroOrMore(comment)) + Optional(global_flags) + Optional(ZeroOrMore(comment)) + Optional(ZeroOrMore(language_option)) + Optional(ZeroOrMore(comment)) + Optional(prover9_block) + Optional(ZeroOrMore(comment)) + Optional(mace4_block) + Optional(ZeroOrMore(comment)) + Optional(assumptions_section) + Optional(ZeroOrMore(comment)) + Optional(goals_section)
grammar = ZeroOrMore( comment | prover9_block | mace4_block | assumptions_section | goals_section | set_option | assign_option | clear_option | language_option)



def parse_string(input_string: str) -> ParseOutput:
    # Parse the content
    result = grammar.parseString(input_string)
    
    # Initialize result containers
    parsed = ParseOutput(
        assumptions='',
        goals='',
        global_parameters=[],
        global_flags=[],
        prover9_options=Prover9Options(),
        mace4_options=Mace4Options(),
        language_options=''
    )
    
    # Process the parsed results
    current_section = None
    current_program = None
    
    for item in result:
        if item[0] == "formulas(assumptions)":
            current_section = "assumptions"
        elif item[0] == "formulas(goals)":
            current_section = "goals"
        elif item[0] == "end_of_list":
            current_section = None
        elif item[0] == "if(Prover9)":
            current_program = "prover9"
        elif item[0] == "if(Mace4)":
            current_program = "mace4"
        elif item[0] == "end_if":
            current_program = None
        elif item[0] == "set":
            option = item[1]
            if current_program == "prover9":
                flag = getattr(parsed.prover9_options, option)
                if flag:
                    flag.value = True
                else:
                    parsed.prover9_options.extra_flags.append(Flag(name=option, value=True))
            elif current_program == "mace4":
                flag = getattr(parsed.mace4_options, option)
                if flag:
                    flag.value = True
                else:
                    parsed.mace4_options.extra_flags.append(Flag(name=option, value=True))
            else:
                parsed.global_flags.append(Flag(name=option, value=True))
        elif item[0] == "clear":
            option = item[1]
            if current_program == "prover9":
                flag = getattr(parsed.prover9_options, option)
                if flag:
                    flag.value = False
                else:
                    parsed.prover9_options.extra_flags.append(Flag(name=option, value=False))
            elif current_program == "mace4":
                flag = getattr(parsed.mace4_options, option)
                if flag:
                    flag.value = False
                else:
                    parsed.mace4_options.extra_flags.append(Flag(name=option, value=False))
            else:
                parsed.global_flags.append(Flag(name=option, value=False))
        elif item[0] == "assign":
            option_name = item[1]
            option_value = item[2]
            if current_program == "prover9":
                parameter = getattr(parsed.prover9_options, option_name)
                if parameter:
                    parameter.value = option_value
                else:
                    parsed.prover9_options.extra_parameters.append(Parameter(name=option_name, value=option_value))
            elif current_program == "mace4":
                parameter = getattr(parsed.mace4_options, option_name)
                if parameter:
                    parameter.value = option_value
                else:
                    parsed.mace4_options.extra_parameters.append(Parameter(name=option_name, value=option_value))
            else:
                parsed.global_parameters.append(Parameter(name=option_name, value=option_value))
        elif item[0] == "op":
            parsed.language_options+='op('+', '.join(item[1:-1])+').\n'
        elif current_section == "assumptions":
            # concatenate the item list to a string
            parsed.assumptions += ''.join(item)+'\n'
        elif current_section == "goals":
            parsed.goals += ''.join(item)+'\n'
    return parsed

def generate_input(input_string: str) -> str:

    assumptions = input.assumptions
    goals = input.goals
    print(input)
    print(input.additional_input)
    parsed = parse_string(input.additional_input)

    # Start with optional settings
    content = "% Saved by Prover9-Mace4 Web GUI\n\n"
    #content += "set(ignore_option_dependencies). % GUI handles dependencies\n\n" #TODO: I'm not handling dependencies
    
    # Add language options
    # if "prolog_style_variables" in input.language_flags: #TODO: I'm not handling language flags
    #     content += "set(prolog_style_variables).\n"
    content += input.language_options
    content += parsed.language_options

    # Add Prover9 options
    content += "if(Prover9). % Options for Prover9\n"
    # loop through Prover9Options
    for name in Prover9Options.model_fields:
        input_field = getattr(input.prover9_options, name)
        additional_field = getattr(parsed.prover9_options, name)
        if isinstance(input_field, Parameter):
            # prefer additional_field
            if additional_field.value != additional_field.default:
                content += f"  assign({name}, {additional_field.value}).\n"
            elif input_field.value != input_field.default:
                content += f"  assign({name}, {input_field.value}).\n"
        elif isinstance(input_field, Flag):
            # prefer additional_field
            if additional_field.value != additional_field.default:
                if additional_field.value:
                    content += f"  set({name}).\n"
                else:
                    content += f"  clear({name}).\n"
            elif input_field.value != input_field.default:
                if input_field.value:
                    content += f"  set({name}).\n"
                else:
                    content += f"  clear({name}).\n"
    for parameter in input.prover9_options.extra_parameters:
        content += f"  assign({parameter.name}, {parameter.value}).\n"
    for flag in input.prover9_options.extra_flags:
        if flag.value:
            content += f"  set({flag.name}).\n"
        else:
            content += f"  clear({flag.name}).\n"
    for parameter in parsed.prover9_options.extra_parameters:
        content += f"  assign({parameter.name}, {parameter.value}).\n"
    for flag in parsed.prover9_options.extra_flags: #TODO: This might produce duplicates
        if flag.value:
            content += f"  set({flag.name}).\n"
        else:
            content += f"  clear({flag.name}).\n"
    content += "end_if.\n\n"
    
    # Add Mace4 options
    content += "if(Mace4). % Options for Mace4\n"
    # loop through Mace4Options
    for name in Mace4Options.model_fields:
        input_field = getattr(input.mace4_options, name)
        additional_field = getattr(parsed.mace4_options, name)
        if isinstance(input_field, Parameter):
            # prefer additional_field
            if additional_field.value != additional_field.default:
                content += f"  assign({name}, {additional_field.value}).\n"
            elif input_field.value != input_field.default:
                content += f"  assign({name}, {input_field.value}).\n"
        elif isinstance(input_field, Flag):
            # prefer additional_field
            if additional_field.value != additional_field.default:
                if additional_field.value:
                    content += f"  set({name}).\n"
                else:
                    content += f"  clear({name}).\n"
            elif input_field.value != input_field.default:
                if input_field.value:
                    content += f"  set({name}).\n"
                else:
                    content += f"  clear({name}).\n"
    for parameter in input.mace4_options.extra_parameters:
        content += f"  assign({parameter.name}, {parameter.value}).\n"
    for flag in input.mace4_options.extra_flags:
        if flag.value:
            content += f"  set({flag.name}).\n"
        else:
            content += f"  clear({flag.name}).\n"
    for parameter in parsed.mace4_options.extra_parameters:
        content += f"  assign({parameter.name}, {parameter.value}).\n"
    for flag in parsed.mace4_options.extra_flags: #TODO: This might produce duplicates
        if flag.value:
            content += f"  set({flag.name}).\n"
        else:
            content += f"  clear({flag.name}).\n"
    content += "end_if.\n\n"
    
    # Add global options and flags
    for option in [input,parsed]:
        for param in option.global_parameters:
            content += f"assign({param.name}, {param.value}).\n"
        for flag in option.global_flags:
            if flag.value:
                content += f"set({flag.name}).\n"
            else:
                content += f"clear({flag.name}).\n"
    # add assumptions and goals
    content += "formulas(assumptions).\n"
    content += assumptions + "\n"
    content += "end_of_list.\n\n"
    content += "formulas(goals).\n"
    content += goals + "\n"
    content += "end_of_list.\n\n"
    return content