package reportentitlementusagemetric

import "fmt"

type AppendStrategy interface {
	Apply(storedValue, newValue float64, eventCount int32) float64
}

type countAppendStrategy struct{}

func (s countAppendStrategy) Apply(storedValue, _ float64, _ int32) float64 {
	return storedValue + 1
}

type sumAppendStrategy struct{}

func (s sumAppendStrategy) Apply(storedValue, newValue float64, _ int32) float64 {
	return storedValue + newValue
}

type averageAppendStrategy struct{}

func (s averageAppendStrategy) Apply(storedValue, newValue float64, eventCount int32) float64 {
	return ((storedValue * float64(eventCount)) + newValue) / float64(eventCount+1)
}

type maxAppendStrategy struct{}

func (s maxAppendStrategy) Apply(storedValue, newValue float64, _ int32) float64 {
	if newValue > storedValue {
		return newValue
	}
	return storedValue
}

type minAppendStrategy struct{}

func (s minAppendStrategy) Apply(storedValue, newValue float64, _ int32) float64 {
	if newValue < storedValue {
		return newValue
	}
	return storedValue
}

type latestAppendStrategy struct{}

func (s latestAppendStrategy) Apply(_ float64, newValue float64, _ int32) float64 {
	return newValue
}

func SelectAppendStrategy(aggregationMethod string) (AppendStrategy, error) {
	switch aggregationMethod {
	case "COUNT":
		return countAppendStrategy{}, nil
	case "SUM":
		return sumAppendStrategy{}, nil
	case "AVERAGE":
		return averageAppendStrategy{}, nil
	case "MAX":
		return maxAppendStrategy{}, nil
	case "MIN":
		return minAppendStrategy{}, nil
	case "LATEST":
		return latestAppendStrategy{}, nil
	default:
		return nil, fmt.Errorf("unsupported aggregation method %q", aggregationMethod)
	}
}
