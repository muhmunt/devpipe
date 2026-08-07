package agent

import "os/exec"

type Availability struct {
	Claude bool `json:"claude"`
	Cursor bool `json:"cursor"`
}

func Detect() Availability {
	return Availability{
		Claude: binExists("claude"),
		Cursor: binExists("cursor-agent"),
	}
}

func binExists(name string) bool {
	_, err := exec.LookPath(name)
	return err == nil
}
