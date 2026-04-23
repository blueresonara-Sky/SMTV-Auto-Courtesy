function filenameCourtesyPanel_run(mogrtPath, textParamName, targetTrackNumberOneBased, scanUpToTrackNumberOneBased, minDurationSeconds, suffix, maxDisplaySeconds, transitionSeconds, ignoreV1) {
    var DEFAULT_FADE_SECONDS = 0.3;
    if (typeof ignoreV1 === 'undefined' && (typeof transitionSeconds === 'boolean' || transitionSeconds === 'true' || transitionSeconds === 'false' || transitionSeconds === 0 || transitionSeconds === 1 || transitionSeconds === '0' || transitionSeconds === '1')) {
        ignoreV1 = transitionSeconds;
        transitionSeconds = DEFAULT_FADE_SECONDS;
    }
    var configuredFadeSeconds = Number(transitionSeconds);
    if (!isFinite(configuredFadeSeconds) || configuredFadeSeconds < 0) {
        configuredFadeSeconds = DEFAULT_FADE_SECONDS;
    }
    ignoreV1 = normalizeBoolean(ignoreV1) === true;
    function fileExists(path) {
        try { var f = new File(path); return f.exists; } catch (e) { return false; }
    }
    function removeExtension(filename) { return String(filename).replace(/\.[^\.]+$/, ""); }
    function trimString(s) { return String(s).replace(/^\s+|\s+$/g, ""); }
    function extractAfterAt(filename) {
        var base = removeExtension(filename);
        var atPos = base.lastIndexOf("@");
        if (atPos === -1 || atPos === base.length - 1) { return null; }
        return trimString(base.substring(atPos + 1));
    }
    function buildCourtesyText(keyAfterAt, suffix) {
        var cleanSuffix = trimString(suffix || "Thank you.");
        if (cleanSuffix.length === 0) { cleanSuffix = "Thank you."; }
        return "Footage courtesy of " + keyAfterAt + ". " + cleanSuffix;
    }
    function getClipDisplayName(trackItem) {
        try { if (trackItem.name) { return String(trackItem.name); } } catch (e) {}
        try { if (trackItem.projectItem && trackItem.projectItem.name) { return String(trackItem.projectItem.name); } } catch (e2) {}
        return null;
    }
    function ticksToSeconds(ticksValue) {
        var ticks = Number(ticksValue);
        if (!isFinite(ticks)) { return 0; }
        return ticks / 254016000000.0;
    }
    function formatSeconds(secondsValue) {
        var seconds = Number(secondsValue);
        if (!isFinite(seconds)) { seconds = 0; }
        return seconds.toFixed(2) + 's';
    }
    function formatClipLocation(trackIndexZeroBased, startTicks, endTicks) {
        var startSeconds = ticksToSeconds(startTicks);
        var durationSeconds = ticksToSeconds(Number(endTicks) - Number(startTicks));
        return 'V' + (trackIndexZeroBased + 1) + ' @ ' + formatSeconds(startSeconds) + ', duration ' + formatSeconds(durationSeconds);
    }
    function secondsToTicks(secondsValue) {
        var secs = Number(secondsValue);
        if (!isFinite(secs) || secs < 0) { secs = 0; }
        return Math.round(secs * 254016000000.0);
    }
    function clipDurationSeconds(clip) {
        try { return ticksToSeconds(Number(clip.end.ticks) - Number(clip.start.ticks)); } catch (e) { return 0; }
    }
    function getTrackCount(videoTracks) {
        if (typeof videoTracks.numTracks !== 'undefined') { return videoTracks.numTracks; }
        if (typeof videoTracks.length !== 'undefined') { return videoTracks.length; }
        return 0;
    }
    function ensureVideoTrackExists(seq, targetTrackIndexZeroBased) {
        var currentCount = getTrackCount(seq.videoTracks);
        if (currentCount === 0) { return false; }
        while (currentCount <= targetTrackIndexZeroBased) {
            try { seq.videoTracks[currentCount - 1].insertTrack(); } catch (e) { break; }
            currentCount = getTrackCount(seq.videoTracks);
            if (currentCount > targetTrackIndexZeroBased) { break; }
        }
        return getTrackCount(seq.videoTracks) > targetTrackIndexZeroBased;
    }
    function getParamByDisplayName(component, displayName) {
        if (!component || !component.properties || !component.properties.numItems) { return null; }
        for (var i = 0; i < component.properties.numItems; i++) {
            var p = component.properties[i];
            if (p && p.displayName === displayName) { return p; }
        }
        return null;
    }
    function updateTextRunLengths(node, newLength) {
        if (!node || typeof node !== 'object') { return; }
        if (node instanceof Array) {
            for (var i = 0; i < node.length; i++) {
                updateTextRunLengths(node[i], newLength);
            }
            return;
        }
        for (var key in node) {
            if (!node.hasOwnProperty(key)) { continue; }
            var value = node[key];
            if (key.match(/TextRunLength$/) && value instanceof Array) {
                node[key] = [newLength];
                continue;
            }
            updateTextRunLengths(value, newLength);
        }
    }
    function setMogrtText(trackItem, paramName, newText) {
        var mogrtComponent = trackItem.getMGTComponent();
        if (!mogrtComponent) { throw new Error('Could not get MOGRT component.'); }
        var textParam = getParamByDisplayName(mogrtComponent, paramName);
        if (!textParam) { throw new Error('Could not find MOGRT text parameter: ' + paramName); }
        var raw = textParam.getValue();
        try {
            var parsed = JSON.parse(raw);
            if (parsed.hasOwnProperty('textEditValue')) { parsed.textEditValue = newText; }
            updateTextRunLengths(parsed, newText.length);
            textParam.setValue(JSON.stringify(parsed), true);
        } catch (e) {
            textParam.setValue(newText, true);
        }
    }
    function normalizeLookupName(name) {
        return String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
    }
    function findComponentParam(trackItem, componentHints, propertyHints) {
        if (!trackItem || !trackItem.components || !trackItem.components.numItems) { return null; }
        var normalizedComponentHints = [];
        var normalizedPropertyHints = [];
        var i = 0;
        for (i = 0; i < componentHints.length; i++) {
            normalizedComponentHints.push(normalizeLookupName(componentHints[i]));
        }
        for (i = 0; i < propertyHints.length; i++) {
            normalizedPropertyHints.push(normalizeLookupName(propertyHints[i]));
        }
        for (i = 0; i < trackItem.components.numItems; i++) {
            var component = trackItem.components[i];
            if (!component) { continue; }
            var componentNames = [
                normalizeLookupName(component.displayName),
                normalizeLookupName(component.matchName)
            ];
            var componentMatches = false;
            for (var c = 0; c < componentNames.length; c++) {
                if (!componentNames[c]) { continue; }
                for (var ch = 0; ch < normalizedComponentHints.length; ch++) {
                    if (componentNames[c] === normalizedComponentHints[ch] || componentNames[c].indexOf(normalizedComponentHints[ch]) !== -1) {
                        componentMatches = true;
                        break;
                    }
                }
                if (componentMatches) { break; }
            }
            if (!componentMatches || !component.properties || !component.properties.numItems) { continue; }
            for (var p = 0; p < component.properties.numItems; p++) {
                var prop = component.properties[p];
                if (!prop) { continue; }
                var propNames = [
                    normalizeLookupName(prop.displayName),
                    normalizeLookupName(prop.matchName)
                ];
                for (var pn = 0; pn < propNames.length; pn++) {
                    if (!propNames[pn]) { continue; }
                    for (var ph = 0; ph < normalizedPropertyHints.length; ph++) {
                        if (propNames[pn] === normalizedPropertyHints[ph] || propNames[pn].indexOf(normalizedPropertyHints[ph]) !== -1) {
                            return prop;
                        }
                    }
                }
            }
        }
        return null;
    }
    function setParamKey(param, timeTicks, value, updateUI) {
        var time = makeTimeFromTicks(timeTicks);
        try { param.addKey(time); } catch (e) {}
        param.setValueAtKey(time, value, updateUI ? 1 : 0);
        try { param.setInterpolationTypeAtKey(time, 0, updateUI ? 1 : 0); } catch (e2) {}
    }
    function applyDefaultFade(trackItem, clipDurationTicks, fadeSeconds) {
        var opacityParam = findComponentParam(trackItem, ['Opacity', 'ADBE Opacity'], ['Opacity']);
        if (!opacityParam) {
            return { applied: false, reason: 'opacity control not found' };
        }
        try {
            if (!opacityParam.areKeyframesSupported || !opacityParam.areKeyframesSupported()) {
                return { applied: false, reason: 'opacity keyframes unsupported' };
            }
        } catch (e) {
            return { applied: false, reason: 'opacity keyframes unsupported' };
        }

        var existingKeys = null;
        try { existingKeys = opacityParam.getKeys(); } catch (e2) {}
        if (existingKeys && existingKeys.length && existingKeys.length > 0) {
            return { applied: false, reason: 'existing opacity animation kept' };
        }

        clipDurationTicks = Math.round(Number(clipDurationTicks));
        if (!isFinite(clipDurationTicks) || clipDurationTicks <= 1) {
            return { applied: false, reason: 'clip too short for fade' };
        }

        var fadeTicks = secondsToTicks(fadeSeconds);
        if (fadeTicks <= 0) {
            return { applied: false, reason: 'invalid fade duration' };
        }

        if (clipDurationTicks <= fadeTicks * 2) {
            fadeTicks = Math.floor(clipDurationTicks / 2);
        }
        if (fadeTicks <= 0) {
            return { applied: false, reason: 'clip too short for fade' };
        }

        try { opacityParam.setTimeVarying(true); } catch (e3) {}

        var clipStartTicks = 0;
        var clipMiddleTicks = Math.floor(clipDurationTicks / 2);
        var clipEndTicks = clipDurationTicks;
        if (clipDurationTicks <= fadeTicks * 2) {
            setParamKey(opacityParam, clipStartTicks, 0, false);
            setParamKey(opacityParam, clipMiddleTicks, 100, false);
            setParamKey(opacityParam, clipEndTicks, 0, true);
        } else {
            setParamKey(opacityParam, clipStartTicks, 0, false);
            setParamKey(opacityParam, clipStartTicks + fadeTicks, 100, false);
            setParamKey(opacityParam, clipEndTicks - fadeTicks, 100, false);
            setParamKey(opacityParam, clipEndTicks, 0, true);
        }

        return { applied: true, reason: '' };
    }
    function makeTimeFromTicks(ticks) {
        var t = new Time();
        t.ticks = String(Math.round(Number(ticks)));
        return t;
    }
    function sameTickValue(a, b) {
        return String(Math.round(Number(a))) === String(Math.round(Number(b)));
    }
    function readSequenceBoundaryTicks(seq, methodName, propertyName) {
        try {
            if (seq && typeof seq[methodName] === 'function') {
                var result = seq[methodName]();
                if (result && typeof result.ticks !== 'undefined') {
                    var methodTicks = Number(result.ticks);
                    if (isFinite(methodTicks)) { return methodTicks; }
                }
                var directMethodValue = Number(result);
                if (isFinite(directMethodValue)) { return directMethodValue; }
            }
        } catch (e) {}
        try {
            if (seq && seq[propertyName] && typeof seq[propertyName].ticks !== 'undefined') {
                var propTicks = Number(seq[propertyName].ticks);
                if (isFinite(propTicks)) { return propTicks; }
            }
        } catch (e2) {}
        try {
            if (seq && typeof seq[propertyName] !== 'undefined') {
                var directPropValue = Number(seq[propertyName]);
                if (isFinite(directPropValue)) { return directPropValue; }
            }
        } catch (e3) {}
        return null;
    }
    function getTrackClipCollection(track) {
        if (track && track.clips && track.clips.numItems) { return track.clips; }
        return null;
    }
    function normalizeBoolean(value) {
        if (typeof value === 'boolean') { return value; }
        if (typeof value === 'number') { return value !== 0; }
        if (typeof value === 'string') {
            var normalized = value.toLowerCase();
            if (normalized === 'true' || normalized === 'on' || normalized === 'yes' || normalized === '1') { return true; }
            if (normalized === 'false' || normalized === 'off' || normalized === 'no' || normalized === '0') { return false; }
        }
        return null;
    }
    function readBooleanFlag(obj, propertyNames) {
        if (!obj) { return null; }
        for (var i = 0; i < propertyNames.length; i++) {
            var propertyName = propertyNames[i];
            try {
                var value = obj[propertyName];
                if (typeof value === 'function') { value = value.call(obj); }
                var normalized = normalizeBoolean(value);
                if (normalized !== null) { return normalized; }
            } catch (e) {}
        }
        return null;
    }
    function isObjectVisibleAndActive(obj) {
        var disabled = readBooleanFlag(obj, ['disabled', 'isDisabled']);
        if (disabled === true) { return false; }
        var enabled = readBooleanFlag(obj, ['enabled', 'isEnabled']);
        if (enabled === false) { return false; }
        var active = readBooleanFlag(obj, ['active', 'isActive']);
        if (active === false) { return false; }
        var hidden = readBooleanFlag(obj, ['hidden', 'isHidden']);
        if (hidden === true) { return false; }
        var visible = readBooleanFlag(obj, ['visible', 'isVisible']);
        if (visible === false) { return false; }
        return true;
    }
    function rangesOverlap(startA, endA, startB, endB) {
        return endA > startB && endB > startA;
    }
    function getHigherTrackCoverageIntervals(seq, clipTrackIndex, startTicks, endTicks, targetTrackIndexZeroBased, maxTrackIndexToScan) {
        var availableTrackCount = getTrackCount(seq.videoTracks);
        var lastTrackIndexToCheck = availableTrackCount - 1;
        if (isFinite(maxTrackIndexToScan) && maxTrackIndexToScan < lastTrackIndexToCheck) {
            lastTrackIndexToCheck = maxTrackIndexToScan;
        }
        var highestNearbyTrackIndex = clipTrackIndex + 2;
        if (highestNearbyTrackIndex < lastTrackIndexToCheck) {
            lastTrackIndexToCheck = highestNearbyTrackIndex;
        }
        var coverageIntervals = [];
        for (var higherTrackIndex = clipTrackIndex + 1; higherTrackIndex <= lastTrackIndexToCheck; higherTrackIndex++) {
            if (higherTrackIndex === targetTrackIndexZeroBased) { continue; }
            var higherTrack = seq.videoTracks[higherTrackIndex];
            if (!higherTrack || !isObjectVisibleAndActive(higherTrack) || !higherTrack.clips || !higherTrack.clips.numItems) { continue; }
            for (var clipIndex = 0; clipIndex < higherTrack.clips.numItems; clipIndex++) {
                var higherClip = higherTrack.clips[clipIndex];
                if (!higherClip || !isObjectVisibleAndActive(higherClip)) { continue; }
                var higherClipName = getClipDisplayName(higherClip);
                if (!higherClipName || !extractAfterAt(higherClipName)) { continue; }
                try {
                    var higherStartTicks = Number(higherClip.start.ticks);
                    var higherEndTicks = Number(higherClip.end.ticks);
                    if (isFinite(higherStartTicks) && isFinite(higherEndTicks) && rangesOverlap(startTicks, endTicks, higherStartTicks, higherEndTicks)) {
                        coverageIntervals.push({
                            startTicks: higherStartTicks > startTicks ? higherStartTicks : startTicks,
                            endTicks: higherEndTicks < endTicks ? higherEndTicks : endTicks
                        });
                    }
                } catch (e) {}
            }
        }
        return coverageIntervals;
    }
    function mergeIntervals(intervals) {
        if (!intervals || !intervals.length) { return []; }
        intervals.sort(function(a, b) { return a.startTicks - b.startTicks; });
        var merged = [{
            startTicks: intervals[0].startTicks,
            endTicks: intervals[0].endTicks
        }];
        for (var i = 1; i < intervals.length; i++) {
            var current = intervals[i];
            var previous = merged[merged.length - 1];
            if (current.startTicks <= previous.endTicks) {
                if (current.endTicks > previous.endTicks) {
                    previous.endTicks = current.endTicks;
                }
            } else {
                merged.push({
                    startTicks: current.startTicks,
                    endTicks: current.endTicks
                });
            }
        }
        return merged;
    }
    function getVisibleSegments(seq, clipTrackIndex, startTicks, endTicks, targetTrackIndexZeroBased, maxTrackIndexToScan) {
        var mergedCoverage = mergeIntervals(getHigherTrackCoverageIntervals(seq, clipTrackIndex, startTicks, endTicks, targetTrackIndexZeroBased, maxTrackIndexToScan));
        if (!mergedCoverage.length) {
            return [{
                startTicks: startTicks,
                endTicks: endTicks
            }];
        }
        var visibleSegments = [];
        var cursor = startTicks;
        for (var i = 0; i < mergedCoverage.length; i++) {
            var covered = mergedCoverage[i];
            if (covered.startTicks > cursor) {
                visibleSegments.push({
                    startTicks: cursor,
                    endTicks: covered.startTicks
                });
            }
            if (covered.endTicks > cursor) {
                cursor = covered.endTicks;
            }
        }
        if (cursor < endTicks) {
            visibleSegments.push({
                startTicks: cursor,
                endTicks: endTicks
            });
        }
        return visibleSegments;
    }
    function getBestVisibleSegment(seq, clipTrackIndex, startTicks, endTicks, targetTrackIndexZeroBased, maxTrackIndexToScan) {
        var visibleSegments = getVisibleSegments(seq, clipTrackIndex, startTicks, endTicks, targetTrackIndexZeroBased, maxTrackIndexToScan);
        var bestSegment = null;
        var totalVisibleTicks = 0;
        for (var i = 0; i < visibleSegments.length; i++) {
            var segment = visibleSegments[i];
            var segmentTicks = segment.endTicks - segment.startTicks;
            if (segmentTicks <= 0) { continue; }
            totalVisibleTicks += segmentTicks;
            if (!bestSegment || segmentTicks > bestSegment.durationTicks || (segmentTicks === bestSegment.durationTicks && segment.startTicks < bestSegment.startTicks)) {
                bestSegment = {
                    startTicks: segment.startTicks,
                    endTicks: segment.endTicks,
                    durationTicks: segmentTicks
                };
            }
        }
        return {
            bestSegment: bestSegment,
            totalVisibleTicks: totalVisibleTicks
        };
    }
    function getFirstEligibleVisibleSegment(seq, clipTrackIndex, startTicks, endTicks, targetTrackIndexZeroBased, maxTrackIndexToScan, minDurationTicks) {
        var visibleSegments = getVisibleSegments(seq, clipTrackIndex, startTicks, endTicks, targetTrackIndexZeroBased, maxTrackIndexToScan);
        var firstSegment = null;
        var totalVisibleTicks = 0;
        for (var i = 0; i < visibleSegments.length; i++) {
            var segment = visibleSegments[i];
            var segmentTicks = segment.endTicks - segment.startTicks;
            if (segmentTicks <= 0) { continue; }
            totalVisibleTicks += segmentTicks;
            if (!firstSegment) {
                firstSegment = {
                    startTicks: segment.startTicks,
                    endTicks: segment.endTicks,
                    durationTicks: segmentTicks
                };
            }
            if (segmentTicks >= minDurationTicks) {
                return {
                    segment: {
                        startTicks: segment.startTicks,
                        endTicks: segment.endTicks,
                        durationTicks: segmentTicks
                    },
                    totalVisibleTicks: totalVisibleTicks
                };
            }
        }
        return {
            segment: firstSegment,
            totalVisibleTicks: totalVisibleTicks
        };
    }
    function getSequenceEndTicks(seq) {
        var maxEndTicks = 0;
        var trackCollections = [seq.videoTracks, seq.audioTracks];
        for (var groupIndex = 0; groupIndex < trackCollections.length; groupIndex++) {
            var tracks = trackCollections[groupIndex];
            var trackCount = getTrackCount(tracks);
            for (var trackIndex = 0; trackIndex < trackCount; trackIndex++) {
                var track = tracks[trackIndex];
                var clips = getTrackClipCollection(track);
                if (!clips) { continue; }
                for (var clipIndex = 0; clipIndex < clips.numItems; clipIndex++) {
                    var clip = clips[clipIndex];
                    if (!clip) { continue; }
                    try {
                        var clipEndTicks = Number(clip.end.ticks);
                        if (isFinite(clipEndTicks) && clipEndTicks > maxEndTicks) {
                            maxEndTicks = clipEndTicks;
                        }
                    } catch (e) {}
                }
            }
        }
        return maxEndTicks;
    }
    function getProcessingRange(seq) {
        var inTicks = readSequenceBoundaryTicks(seq, 'getInPointAsTime', 'inPoint');
        if (!isFinite(inTicks)) { inTicks = readSequenceBoundaryTicks(seq, 'getInPoint', 'inPoint'); }
        var outTicks = readSequenceBoundaryTicks(seq, 'getOutPointAsTime', 'outPoint');
        if (!isFinite(outTicks)) { outTicks = readSequenceBoundaryTicks(seq, 'getOutPoint', 'outPoint'); }

        if (isFinite(inTicks) && isFinite(outTicks) && outTicks > inTicks) {
            return {
                startTicks: inTicks,
                endTicks: outTicks,
                mode: 'in_out'
            };
        }

        return {
            startTicks: 0,
            endTicks: getSequenceEndTicks(seq),
            mode: 'full_sequence'
        };
    }

    function collectEligibleClips(seq, minDurationSeconds, targetTrackIndexZeroBased, scanUpToTrackNumberOneBased, processingRange) {
        var availableTrackCount = getTrackCount(seq.videoTracks);
        var bestByKey = {};
        var logs = [];
        var maxTrackIndexToScan = Number(scanUpToTrackNumberOneBased) - 1;
        if (!isFinite(maxTrackIndexToScan) || maxTrackIndexToScan < 0) { maxTrackIndexToScan = availableTrackCount - 1; }
        if (maxTrackIndexToScan > availableTrackCount - 1) { maxTrackIndexToScan = availableTrackCount - 1; }

        for (var trackIndex = 0; trackIndex <= maxTrackIndexToScan; trackIndex++) {
            if (trackIndex === targetTrackIndexZeroBased) { continue; }
            if (ignoreV1 && trackIndex === 0) {
                logs.push('SKIP: V1 ignored by checkbox setting');
                continue;
            }
            var track = seq.videoTracks[trackIndex];
            if (!track || !track.clips || !track.clips.numItems) { continue; }
            if (!isObjectVisibleAndActive(track)) {
                logs.push('SKIP: inactive or hidden track V' + (trackIndex + 1));
                continue;
            }

            for (var i = 0; i < track.clips.numItems; i++) {
                var clip = track.clips[i];
                if (!clip) { continue; }
                if (!isObjectVisibleAndActive(clip)) {
                    var hiddenName = getClipDisplayName(clip) || ('clip on V' + (trackIndex + 1));
                    logs.push('SKIP: hidden or inactive -> ' + hiddenName);
                    continue;
                }

                var clipName = getClipDisplayName(clip);
                if (!clipName) { logs.push('SKIP: unnamed clip on V' + (trackIndex + 1)); continue; }

                var keyAfterAt = extractAfterAt(clipName);

                var startTicks = Number(clip.start.ticks);
                var runEndTicks = Number(clip.end.ticks);
                if (!keyAfterAt) {
                    logs.push('SKIP: no @ segment at ' + formatClipLocation(trackIndex, startTicks, runEndTicks) + ' -> ' + clipName);
                    continue;
                }

                var overlapStartTicks = startTicks > processingRange.startTicks ? startTicks : processingRange.startTicks;
                var overlapEndTicks = runEndTicks < processingRange.endTicks ? runEndTicks : processingRange.endTicks;
                var runDurationSeconds = ticksToSeconds(overlapEndTicks - overlapStartTicks);
                var runNames = [clipName];

                var j = i + 1;
                while (j < track.clips.numItems) {
                    var nextClip = track.clips[j];
                    if (!nextClip) { break; }

                    var nextName = getClipDisplayName(nextClip);
                    var nextKey = nextName ? extractAfterAt(nextName) : null;

                    if (!nextKey || nextKey !== keyAfterAt) { break; }
                    if (!sameTickValue(nextClip.start.ticks, runEndTicks)) { break; }

                    runEndTicks = Number(nextClip.end.ticks);
                    overlapStartTicks = startTicks > processingRange.startTicks ? startTicks : processingRange.startTicks;
                    overlapEndTicks = runEndTicks < processingRange.endTicks ? runEndTicks : processingRange.endTicks;
                    runDurationSeconds = ticksToSeconds(overlapEndTicks - overlapStartTicks);
                    runNames.push(nextName);
                    j++;
                }

                if (overlapEndTicks <= overlapStartTicks) {
                    logs.push('SKIP: outside selected range at ' + formatClipLocation(trackIndex, startTicks, runEndTicks) + ' -> ' + runNames.join(' | '));
                    i = j - 1;
                    continue;
                }

                var visibilityInfo = getFirstEligibleVisibleSegment(seq, trackIndex, overlapStartTicks, overlapEndTicks, targetTrackIndexZeroBased, maxTrackIndexToScan, secondsToTicks(minDurationSeconds));
                if (!visibilityInfo.segment) {
                    logs.push('SKIP: fully covered by higher visible @ source within selected scan range at ' + formatClipLocation(trackIndex, overlapStartTicks, overlapEndTicks) + ' -> ' + runNames.join(' | '));
                    i = j - 1;
                    continue;
                }

                overlapStartTicks = visibilityInfo.segment.startTicks;
                overlapEndTicks = visibilityInfo.segment.endTicks;
                runDurationSeconds = ticksToSeconds(visibilityInfo.segment.durationTicks);

                if (runDurationSeconds < minDurationSeconds) {
                    if (runNames.length > 1) {
                        logs.push('SKIP: longest exposed consecutive run too short at ' + formatClipLocation(trackIndex, overlapStartTicks, overlapEndTicks) + ' -> ' + formatSeconds(runDurationSeconds) + ' visible -> ' + runNames.join(' | '));
                    } else {
                        logs.push('SKIP: exposed portion too short at ' + formatClipLocation(trackIndex, overlapStartTicks, overlapEndTicks) + ' -> ' + formatSeconds(runDurationSeconds) + ' visible -> ' + clipName);
                    }
                    i = j - 1;
                    continue;
                }

                if (!bestByKey.hasOwnProperty(keyAfterAt)) {
                    bestByKey[keyAfterAt] = {
                        keyAfterAt: keyAfterAt,
                        clipName: clipName,
                        startTicks: overlapStartTicks,
                        endTicks: overlapEndTicks,
                        trackIndex: trackIndex,
                        durationSeconds: runDurationSeconds
                    };
                    logs.push('SELECT: first eligible "' + keyAfterAt + '" at ' + formatClipLocation(trackIndex, overlapStartTicks, overlapEndTicks) + ' -> ' + clipName);
                } else if (overlapStartTicks < bestByKey[keyAfterAt].startTicks) {
                    logs.push('SELECT: earlier eligible "' + keyAfterAt + '" replaces ' + formatClipLocation(bestByKey[keyAfterAt].trackIndex, bestByKey[keyAfterAt].startTicks, bestByKey[keyAfterAt].endTicks) + ' with ' + formatClipLocation(trackIndex, overlapStartTicks, overlapEndTicks) + ' -> ' + clipName);
                    bestByKey[keyAfterAt] = {
                        keyAfterAt: keyAfterAt,
                        clipName: clipName,
                        startTicks: overlapStartTicks,
                        endTicks: overlapEndTicks,
                        trackIndex: trackIndex,
                        durationSeconds: runDurationSeconds
                    };
                } else {
                    logs.push('SKIP: later duplicate "' + keyAfterAt + '" kept earlier ' + formatClipLocation(bestByKey[keyAfterAt].trackIndex, bestByKey[keyAfterAt].startTicks, bestByKey[keyAfterAt].endTicks) + ', ignored ' + formatClipLocation(trackIndex, overlapStartTicks, overlapEndTicks) + ' -> ' + clipName);
                }

                i = j - 1;
            }
        }

        var collected = [];
        for (var key in bestByKey) {
            if (bestByKey.hasOwnProperty(key)) { collected.push(bestByKey[key]); }
        }
        collected.sort(function(a, b) { return a.startTicks - b.startTicks; });
        return { clips: collected, logs: logs };
    }

    function insertCourtesyClip(seq, targetTrackIndexZeroBased, mogrtPath, textParamName, item, suffix, maxDisplaySeconds) {
        var inserted = seq.importMGT(mogrtPath, String(item.startTicks), targetTrackIndexZeroBased, 0);
        if (!inserted) { throw new Error('importMGT failed.'); }
        var finalText = buildCourtesyText(item.keyAfterAt, suffix);
        setMogrtText(inserted, textParamName, finalText);
        var actualSeconds = item.durationSeconds;
        var maxSecs = Number(maxDisplaySeconds);
        if (!isFinite(maxSecs) || maxSecs <= 0) { maxSecs = 3; }
        var displaySeconds = actualSeconds < maxSecs ? actualSeconds : maxSecs;
        var desiredEndTicks = item.startTicks + secondsToTicks(displaySeconds);
        try {
            inserted.end = makeTimeFromTicks(desiredEndTicks);
        } catch (e) {
            try { inserted.end = item.end; } catch (e2) {}
        }
        var finalEndTicks = desiredEndTicks;
        try {
            var insertedEndTicks = Number(inserted.end.ticks);
            if (isFinite(insertedEndTicks) && insertedEndTicks > item.startTicks) {
                finalEndTicks = insertedEndTicks;
            }
        } catch (e3) {}
        var fadeResult = applyDefaultFade(inserted, finalEndTicks - item.startTicks, configuredFadeSeconds);
        return {
            text: finalText,
            displaySeconds: displaySeconds,
            fadeApplied: fadeResult.applied,
            fadeReason: fadeResult.reason
        };
    }

    try {
        if (!app.project) { return 'FAIL: No project is open.'; }
        var seq = app.project.activeSequence;
        if (!seq) { return 'FAIL: No active sequence.'; }
        if (!fileExists(mogrtPath)) { return 'FAIL: MOGRT file not found: ' + mogrtPath; }

        var targetTrackIndex = Number(targetTrackNumberOneBased) - 1;
        if (!isFinite(targetTrackIndex) || targetTrackIndex < 0) { return 'FAIL: Invalid target track.'; }

        var durationCutoff = Number(minDurationSeconds);
        if (!isFinite(durationCutoff) || durationCutoff < 0) { durationCutoff = 2; }

        var maxSecs = Number(maxDisplaySeconds);
        if (!isFinite(maxSecs) || maxSecs <= 0) { maxSecs = 3; }

        if (!ensureVideoTrackExists(seq, targetTrackIndex)) {
            return 'FAIL: Could not create or access target video track V' + (targetTrackIndex + 1) + '.';
        }

        var scanUpToTrackNumberOneBased = Number(scanUpToTrackNumberOneBased);
        if (!isFinite(scanUpToTrackNumberOneBased) || scanUpToTrackNumberOneBased < 1) { scanUpToTrackNumberOneBased = 8; }
        var processingRange = getProcessingRange(seq);
        var collected = collectEligibleClips(seq, durationCutoff, targetTrackIndex, scanUpToTrackNumberOneBased, processingRange);
        var clips = collected.clips;
        var lines = [];
        var processed = 0;
        var failed = 0;

        lines.push('Scanning source tracks: V1 to V' + scanUpToTrackNumberOneBased + ' where available, excluding the target text track');
        lines.push('Target text track: V' + (targetTrackIndex + 1));
        lines.push('Minimum duration: ' + durationCutoff + 's');
        lines.push('Maximum courtesy duration: ' + maxSecs + 's');
        lines.push('Default fade: ' + configuredFadeSeconds + 's fade-in/out on inserted courtesy clips');
        if (processingRange.mode === 'in_out') {
            lines.push('Processing range: active In/Out selection (' + ticksToSeconds(processingRange.endTicks - processingRange.startTicks).toFixed(2) + 's)');
        } else {
            lines.push('Processing range: full active sequence (' + ticksToSeconds(processingRange.endTicks - processingRange.startTicks).toFixed(2) + 's)');
        }
        lines.push('Unique key: text after @');
        lines.push('Consecutive same-key cuts: combined before minimum-duration check');
        lines.push('Coverage rule: hidden/inactive clips are skipped; higher clips only count as coverage when they also have an @ source name');
        lines.push('Visible segment rule: use the first visible segment that meets the minimum duration');
        lines.push('');

        if (clips.length === 0) {
            lines.push('No eligible clips found.');
            if (collected.logs.length) {
                lines.push('');
                lines.push('Details:');
                for (var dl = 0; dl < collected.logs.length; dl++) { lines.push(collected.logs[dl]); }
            }
            return lines.join('\n');
        }

        for (var i = 0; i < clips.length; i++) {
            var item = clips[i];
            try {
                var result = insertCourtesyClip(seq, targetTrackIndex, mogrtPath, textParamName, item, suffix, maxSecs);
                processed++;
                var fadeLabel = result.fadeApplied ? ', fade applied' : ', fade skipped: ' + result.fadeReason;
                lines.push('OK: ' + formatClipLocation(item.trackIndex, item.startTicks, item.endTicks) + ' -> ' + item.clipName + ' -> ' + result.text + ' [' + result.displaySeconds.toFixed(2) + 's' + fadeLabel + ']');
            } catch (e) {
                failed++;
                lines.push('FAIL: ' + item.clipName + ' -> Error: ' + e);
            }
        }

        if (collected.logs.length) {
            lines.push('');
            lines.push('Skipped while scanning:');
            for (var sl = 0; sl < collected.logs.length; sl++) { lines.push(collected.logs[sl]); }
        }

        lines.push('');
        lines.push('Summary: processed ' + processed + ', failed ' + failed + ', unique eligible sources ' + clips.length + '.');
        return lines.join('\n');
    } catch (fatal) {
        return 'FAIL: ' + fatal;
    }
}
var filenameCourtesyPanel = { run: filenameCourtesyPanel_run };






function filenameCourtesyPanel_getUpdaterContext() {
    try {
        var jsxFile = new File($.fileName);
        var rootFolder = jsxFile.parent.parent;
        var manifestFile = new File(rootFolder.fsName + '/CSXS/manifest.xml');
        var currentVersion = 'Unknown';

        if (manifestFile.exists && manifestFile.open('r')) {
            var manifestContents = manifestFile.read();
            manifestFile.close();
            var match = manifestContents.match(/ExtensionBundleVersion="([^"]+)"/);
            if (match && match[1]) {
                currentVersion = String(match[1]);
            }
        }

        var updatesFolder = new Folder(rootFolder.fsName + '/updates');
        if (!updatesFolder.exists) {
            updatesFolder.create();
        }

        return JSON.stringify({
            currentVersion: currentVersion,
            extensionRoot: rootFolder.fsName,
            updatesFolder: updatesFolder.fsName
        });
    } catch (e) {
        return 'FAIL: ' + e;
    }
}

function filenameCourtesyPanel_base64ToBinary(base64Text) {
    var alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    var clean = String(base64Text || '').replace(/[^A-Za-z0-9\+\/\=]/g, '');
    var output = [];
    var i;

    for (i = 0; i < clean.length; i += 4) {
        var enc1 = alphabet.indexOf(clean.charAt(i));
        var enc2 = alphabet.indexOf(clean.charAt(i + 1));
        var enc3Char = clean.charAt(i + 2);
        var enc4Char = clean.charAt(i + 3);
        var enc3 = enc3Char === '=' ? 64 : alphabet.indexOf(enc3Char);
        var enc4 = enc4Char === '=' ? 64 : alphabet.indexOf(enc4Char);

        var chr1 = (enc1 << 2) | (enc2 >> 4);
        output.push(String.fromCharCode(chr1));

        if (enc3 !== 64) {
            var chr2 = ((enc2 & 15) << 4) | (enc3 >> 2);
            output.push(String.fromCharCode(chr2));
        }

        if (enc4 !== 64) {
            var chr3 = ((enc3 & 3) << 6) | enc4;
            output.push(String.fromCharCode(chr3));
        }
    }

    return output.join('');
}

function filenameCourtesyPanel_beginUpdateWrite(targetPath) {
    try {
        var targetFile = new File(targetPath);
        var parentFolder = targetFile.parent;
        if (parentFolder && !parentFolder.exists) {
            parentFolder.create();
        }
        if (targetFile.exists) {
            try { targetFile.remove(); } catch (removeError) {}
        }
        targetFile.encoding = 'BINARY';
        if (!targetFile.open('w')) {
            return 'FAIL: Could not open update file for writing.';
        }
        targetFile.close();
        return 'OK';
    } catch (e) {
        return 'FAIL: ' + e;
    }
}

function filenameCourtesyPanel_quoteForPowerShell(value) {
    return "'" + String(value || '').replace(/'/g, "''") + "'";
}

function filenameCourtesyPanel_downloadUpdateAsset(downloadUrl, targetPath) {
    try {
        var command =
            "$ErrorActionPreference='Stop'; " +
            "$ProgressPreference='SilentlyContinue'; " +
            '$url=' + filenameCourtesyPanel_quoteForPowerShell(downloadUrl) + '; ' +
            '$out=' + filenameCourtesyPanel_quoteForPowerShell(targetPath) + '; ' +
            '$parent=Split-Path -Parent $out; ' +
            'if ($parent -and !(Test-Path -LiteralPath $parent)) { New-Item -ItemType Directory -Path $parent -Force | Out-Null }; ' +
            'Invoke-WebRequest -UseBasicParsing -Uri $url -OutFile $out; ' +
            "Write-Output 'OK'";
        var shellCommand = 'powershell -NoProfile -ExecutionPolicy Bypass -Command ' + filenameCourtesyPanel_quoteForPowerShell(command);
        var result = String(system.callSystem(shellCommand) || '');
        var trimmed = result.replace(/^\s+|\s+$/g, '');
        if (trimmed.indexOf('OK') === 0) {
            return 'OK';
        }
        if (trimmed.length) {
            return 'FAIL: ' + trimmed;
        }
        return 'FAIL: Download command returned no output.';
    } catch (e) {
        return 'FAIL: ' + e;
    }
}

function filenameCourtesyPanel_appendUpdateChunk(targetPath, base64Chunk) {
    try {
        var targetFile = new File(targetPath);
        targetFile.encoding = 'BINARY';
        if (!targetFile.open('a')) {
            return 'FAIL: Could not append update data.';
        }
        targetFile.write(filenameCourtesyPanel_base64ToBinary(base64Chunk));
        targetFile.close();
        return 'OK';
    } catch (e) {
        return 'FAIL: ' + e;
    }
}
