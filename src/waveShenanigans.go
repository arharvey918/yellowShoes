package main

import (
	"encoding/binary"
	"fmt"
	"math"
	"os"
	"time"
)

const (
	smokeSampleRate    = 44100
	smokeChannels      = 1
	smokeBitsPerSample = 16
	smokeChunkFrames   = smokeSampleRate / 4
	smokeToneHz        = 440.0
	smokeAmplitude     = 0.2
	smokeBitRateLabel  = "705 kbps"
)

func fixWav(wav string) bool {

	if getFileSize(wav) < 79 {
		return false
	}

	f, err := os.OpenFile(wav, os.O_RDWR, 0666)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Err opening %s %v\n", wav, err)
		return false
	}
	defer f.Close()
	var maxVal uint32
	maxVal = 0xffffffff

	chunkSize, ok := readU32(f, 4)
	if !ok {
		return ok
	}

	subChunk2Size, ok := readU32(f, 40)
	if !ok {
		return ok
	}

	var k, l bool
	if chunkSize != maxVal {
		k = writeU32(f, 4, maxVal)
	} else {
		k = true
	}

	if subChunk2Size != maxVal {
		l = writeU32(f, 40, maxVal)
	} else {
		l = true
	}

	return (k && l)
}

func readU32(f *os.File, seekTo int64) (uint32, bool) {
	_, err := f.Seek(seekTo, 0)
	if err != nil {
		return 0, false
	}
	var temp uint32 = 0
	err = binary.Read(f, binary.LittleEndian, &temp)
	if err != nil {
		return 0, false
	}
	return temp, true
}

func writeU32(f *os.File, seekTo int64, writeThis uint32) bool {
	_, err := f.Seek(seekTo, 0)
	if err != nil {
		return false
	}
	err = binary.Write(f, binary.LittleEndian, &writeThis)
	return err == nil
}

func (tagPtr *tagStruct) runSmoke() error {
	self := tagPtr
	output, err := os.OpenFile(self.audioFile, os.O_CREATE|os.O_RDWR|os.O_TRUNC, 0644)
	if err != nil {
		return err
	}

	err = writeSmokeWavHeader(output)
	if err != nil {
		output.Close()
		return err
	}

	phase := 0.0
	err = writeSmokeSamples(output, &phase, smokeChunkFrames)
	if err != nil {
		output.Close()
		return err
	}

	self.Lock()
	self.infoMap["Title"] = "yellowShoes smoke tone"
	self.infoMap["Station name"] = "yellowShoes smoke mode"
	self.infoMap["Slogan"] = "Generated WAV stream"
	self.infoMap["Audio component"] = "Synthetic audio"
	self.infoMap["Audio bit rate"] = smokeBitRateLabel
	self.infoMap["Mode"] = "smoke"
	self.Unlock()

	go func() {
		ticker := time.NewTicker(250 * time.Millisecond)
		defer ticker.Stop()
		defer output.Close()
		defer func() {
			status.Lock()
			delete(status.tagMap, self.tag)
			delete(status.tagMap, self.freq)
			status.Unlock()
			self.Lock()
			self.done = true
			self.Unlock()
			os.Remove(self.audioFile)
		}()

		for range ticker.C {
			self.RLock()
			done := self.done
			self.RUnlock()
			if done {
				return
			}
			if err := writeSmokeSamples(output, &phase, smokeChunkFrames); err != nil {
				self.Lock()
				self.cmdExite = err
				self.done = true
				self.Unlock()
				return
			}
		}
	}()

	return nil
}

func writeSmokeWavHeader(output *os.File) error {
	byteRate := smokeSampleRate * smokeChannels * smokeBitsPerSample / 8
	blockAlign := smokeChannels * smokeBitsPerSample / 8
	writePair := []struct {
		label string
		value interface{}
	}{
		{"RIFF", nil},
		{"", uint32(36)},
		{"WAVE", nil},
		{"fmt ", nil},
		{"", uint32(16)},
		{"", uint16(1)},
		{"", uint16(smokeChannels)},
		{"", uint32(smokeSampleRate)},
		{"", uint32(byteRate)},
		{"", uint16(blockAlign)},
		{"", uint16(smokeBitsPerSample)},
		{"data", nil},
		{"", uint32(0)},
	}

	for _, item := range writePair {
		if item.label != "" {
			if _, err := output.Write([]byte(item.label)); err != nil {
				return err
			}
			continue
		}
		if err := binary.Write(output, binary.LittleEndian, item.value); err != nil {
			return err
		}
	}

	return nil
}

func writeSmokeSamples(output *os.File, phase *float64, frameCount int) error {
	samples := make([]int16, frameCount)
	phaseDelta := (2 * math.Pi * smokeToneHz) / smokeSampleRate
	for i := range samples {
		samples[i] = int16(math.Sin(*phase) * smokeAmplitude * 32767)
		*phase += phaseDelta
		if *phase >= 2*math.Pi {
			*phase -= 2 * math.Pi
		}
	}
	return binary.Write(output, binary.LittleEndian, samples)
}
