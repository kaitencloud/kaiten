use cel::{Context, ExecutionError, ParseErrors, Program};
use js_sys::Object;
use serde::Serialize;
use std::collections::HashMap;
use wasm_bindgen::prelude::*;

#[derive(Debug, Serialize)]
struct ValidationError {
    message: String,
    line: Option<usize>,
    column: Option<usize>,
}

#[derive(Debug, Serialize)]
struct ValidationResult {
    #[serde(rename = "isValid")]
    is_valid: bool,
    errors: Vec<ValidationError>,
}

fn valid_result() -> ValidationResult {
    ValidationResult {
        is_valid: true,
        errors: Vec::new(),
    }
}

fn invalid_result(errors: Vec<ValidationError>) -> ValidationResult {
    ValidationResult {
        is_valid: false,
        errors,
    }
}

fn to_js_value(result: &ValidationResult) -> JsValue {
    serde_wasm_bindgen::to_value(result).unwrap_or(JsValue::NULL)
}

fn parse_errors_to_validation(parse_errors: ParseErrors) -> ValidationResult {
    let errors = parse_errors
        .errors
        .into_iter()
        .map(|error| ValidationError {
            message: error.msg,
            line: positive_position(error.pos.0),
            column: positive_position(error.pos.1),
        })
        .collect();

    invalid_result(errors)
}

fn positive_position(value: isize) -> Option<usize> {
    usize::try_from(value).ok().filter(|v| *v > 0)
}

fn extract_context_variables(context_schema: &JsValue) -> HashMap<String, bool> {
    if context_schema.is_null() || context_schema.is_undefined() || !context_schema.is_object() {
        return HashMap::new();
    }

    let object: Object = context_schema.clone().into();
    let keys = Object::keys(&object);
    let mut variables = HashMap::with_capacity(keys.length() as usize);

    for key in keys.iter() {
        if let Some(name) = key.as_string() {
            variables.insert(name, true);
        }
    }

    variables
}

fn is_identifier_char(ch: char) -> bool {
    ch.is_ascii_alphanumeric() || ch == '_'
}

fn find_identifier_position(expression: &str, identifier: &str) -> Option<(usize, usize)> {
    if identifier.is_empty() {
        return None;
    }

    for (line_idx, line) in expression.lines().enumerate() {
        let mut search_start = 0usize;
        while let Some(relative_idx) = line[search_start..].find(identifier) {
            let start = search_start + relative_idx;
            let end = start + identifier.len();

            let left_ok = line[..start]
                .chars()
                .next_back()
                .map(|ch| !is_identifier_char(ch))
                .unwrap_or(true);
            let right_ok = line[end..]
                .chars()
                .next()
                .map(|ch| !is_identifier_char(ch))
                .unwrap_or(true);

            if left_ok && right_ok {
                return Some((line_idx + 1, start + 1));
            }

            search_start = end;
        }
    }

    None
}

fn execution_error_to_validation(
    error: ExecutionError,
    expression: &str,
    strict_errors: bool,
) -> ValidationResult {
    match error {
        ExecutionError::UndeclaredReference(name) => {
            let (line, column) = find_identifier_position(expression, name.as_str())
                .map(|(line, column)| (Some(line), Some(column)))
                .unwrap_or((None, None));

            invalid_result(vec![ValidationError {
                message: format!("Undeclared reference to '{name}'"),
                line,
                column,
            }])
        }
        _ if strict_errors => invalid_result(vec![ValidationError {
            message: error.to_string(),
            line: None,
            column: None,
        }]),
        _ => valid_result(),
    }
}

#[wasm_bindgen(js_name = validateCEL)]
pub fn validate_cel(expression: &str, context_schema: JsValue) -> JsValue {
    if expression.is_empty() {
        return to_js_value(&invalid_result(vec![ValidationError {
            message: "No expression provided".to_string(),
            line: None,
            column: None,
        }]));
    }

    let context_variables = extract_context_variables(&context_schema);

    let program = match Program::compile(expression) {
        Ok(program) => program,
        Err(parse_errors) => return to_js_value(&parse_errors_to_validation(parse_errors)),
    };

    let references = program.references();
    let has_references = !references.variables().is_empty();

    let mut context = Context::default();
    for name in context_variables.keys() {
        // Empty maps let member access parse while still letting undeclared roots fail.
        context.add_variable_from_value(name.as_str(), HashMap::<String, i32>::new());
    }

    let strict_errors = !has_references;
    let result = match program.execute(&context) {
        Ok(_) => valid_result(),
        Err(error) => execution_error_to_validation(error, expression, strict_errors),
    };

    to_js_value(&result)
}

#[cfg(test)]
mod tests {
    use cel::Program;

    // What a rule looks like halfway through typing. `cel-interpreter` 0.10
    // panicked on each of these, and a panic aborts the WebAssembly instance:
    // the editor saw a `RuntimeError: unreachable` instead of a parse error.
    #[test]
    fn half_typed_expressions_are_parse_errors() {
        let expressions = [
            "1 ==", "1 +", "(", ")", "a &&", "\"abc", "{\"a\":", "@", " ",
        ];

        for expression in expressions {
            assert!(
                Program::compile(expression).is_err(),
                "{expression:?} should be a parse error"
            );
        }
    }

    #[test]
    fn complete_expressions_compile() {
        let expressions = [
            "1 == 1",
            "context.plan == \"enterprise\" && context.seats > 10",
            "context.email.endsWith(\"@acme.com\")",
            "context.tags.exists(t, t == \"x\")",
        ];

        for expression in expressions {
            assert!(
                Program::compile(expression).is_ok(),
                "{expression:?} should compile"
            );
        }
    }
}
