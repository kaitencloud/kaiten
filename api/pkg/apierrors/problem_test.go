package apierrors

import (
	"net/http"
	"testing"
)

func TestProblemFromCarriesErrorsOfAConflict(t *testing.T) {
	err := ConflictWithErrors("Report.KeyReused", "already used", &ErrorDetail{
		Message:  "the original report",
		Location: "body.transactionId",
		Value:    map[string]any{"reportSeq": 7},
	})

	problem := ProblemFrom(err, "/api/reports")

	if problem.Status != http.StatusConflict || problem.Code != "Report.KeyReused" {
		t.Fatalf("problem = %d %q, want 409 Report.KeyReused", problem.Status, problem.Code)
	}
	if len(problem.Errors) != 1 || problem.Errors[0].Location != "body.transactionId" {
		t.Fatalf("problem.Errors = %+v, want the one entry at body.transactionId", problem.Errors)
	}
}

func TestProblemFromLeavesErrorsEmptyWithoutThem(t *testing.T) {
	problem := ProblemFrom(Conflict("Report.Conflict", "no details"), "")

	if problem.Errors != nil {
		t.Fatalf("problem.Errors = %+v, want none", problem.Errors)
	}
}
