// --- PACER LOGIC ---
class SammyPacer {
    constructor(emptyBufferCoeff = 2.8, fullBufferCoeff = 1.6, fullBufferLevel = 3.2) {
        this.config = { emptyBufferCoeff, fullBufferCoeff, fullBufferLevel };
    }

    getPacingRate(bufferLevel, highestBitrate, isEnabled) {
        if (!isEnabled) return null; 
        
        const bufferFrac = Math.min(bufferLevel / this.config.fullBufferLevel, 1);
        const multiplier = (this.config.fullBufferCoeff * bufferFrac) + 
                           (this.config.emptyBufferCoeff * (1 - bufferFrac));
        
        return multiplier * highestBitrate;
    }
}

// --- TELEMETRY & CSV LOGIC ---
class TelemetryManager {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        // Updated header to log only time and throughput
        this.csvRows = [["Relative_Time_sec","Bitrate_kbps","Buffer_sec","Rebuffer_Events","Play_Delay_ms"]];
        this.sessionStartTime = Date.now();

        this.rebufferCount = 0;
        this.playDelay = 0;
        this.hasStartedPlaying = false;
    }

    recordPlayDelay(){
        if(!this.hasStartedPlaying){
            this.playDelay = Date.now()-this.sessionStartTime;
            this.hasStartedPlaying =true;
        }
    }

    recordRebuffer(){
        this.rebufferCount++;
    }

    logQoEMetrics(relativeTime,bitrate,buffer) {
        // Store only the specific data requested
        this.csvRows.push([relativeTime, bitrate,buffer,this.rebufferCount,this.playDelay]);

        if (this.container) {
            this.container.innerHTML = `
                <strong>QOE Monitor:</strong><br>
                Bitrate: ${bitrate} kbps | Buffer : ${buffer}s<br>
                play Delay: ${this.playDelay} ms | Rebuffers : ${this.rebufferCount}
            `;
        }
    }

    downloadCSV() {
        const csvContent = "data:text/csv;charset=utf-8," + this.csvRows.map(e => e.join(",")).join("\n");
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `Metrics_log_${Date.now()}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
}

// --- HELPERS ---
function getVideoBitrates(playerInstance) {
    let list = [];
    if (typeof playerInstance.getBitrateInfoListFor === "function") {
        list = playerInstance.getBitrateInfoListFor("video");
    } else if (typeof playerInstance.getTracksFor === "function") {
        let tracks = playerInstance.getTracksFor("video");
        if (tracks?.[0]?.bitrateList) list = tracks[0].bitrateList;
    }
    return list || [];
}

// --- MAIN APPLICATION ---
const STREAM_URL = "http://10.0.0.1:8081/bbb_30fps.mpd"; 
const player = dashjs.MediaPlayer().create();
const pacer = new SammyPacer();
const telemetry = new TelemetryManager('logs');
const sammyToggle = document.getElementById('enable-sammy');
let isInitialPhase = false;

player.updateSettings({
    streaming: {
        buffer: { fastSwitchEnabled: true }
    }
});

// v4 Request Modifier for Header Injection [cite: 243, 251]
player.extend("RequestModifier", function () {
    return {
        modifyRequestHeader: function (xhr) {
            const isSammyEnabled = sammyToggle ? sammyToggle.checked : true;
            const bufferLevel = player.getBufferLength("video") || 0;
            const bitrateInfos = getVideoBitrates(player); 

            if(!isInitialPhase)return xhr;
            if (bitrateInfos.length === 0) return xhr;

            const highestBitrateKbps = Math.max(...bitrateInfos.map(x => x.bitrate || x.bandwidth)) / 1000;
            let paceRateKbps = pacer.getPacingRate(bufferLevel, highestBitrateKbps, isSammyEnabled);
            console.log(highestBitrateKbps);
            if (paceRateKbps) {
                // Communicates pace rate to transport layer via HTTP header [cite: 362]
                xhr.setRequestHeader('Pacing-Rate-KBps', Math.floor(paceRateKbps / 8));
            }
            return xhr;
        }
    };
});

player.on(dashjs.MediaPlayer.events.CAN_PLAY, function() {
    isInitialPhase = true;
    telemetry.recordPlayDelay();
});

player.on(dashjs.MediaPlayer.events.PLAYBACK_WAITING, function() {
    telemetry.recordRebuffer();
});

// v4 Metrics Gathering via Events [cite: 412, 413]
player.on(dashjs.MediaPlayer.events.FRAGMENT_LOADING_COMPLETED, function (e) {
    if (e.request && e.request.mediaType === "video" && e.request.type === "MediaSegment") {
        
        const now = Date.now();
        const relativeTimeSec = ((now - telemetry.sessionStartTime) / 1000).toFixed(2);

        let startTime = e.request.requestStartDate ? e.request.requestStartDate.getTime() : null;
        let endTime = e.request.requestEndDate ? e.request.requestEndDate.getTime() : null;
        let bytes = e.response ? e.response.byteLength : e.request.bytesTotal;
        let bitrateInfos = getVideoBitrates(player);
        let currentBitrate = (bitrateInfos[e.request.quality].bitrate / 1000).toFixed(0);
        let throughputMbps = 0;
        
        if (startTime && endTime) {
            let durationMs = endTime - startTime; 
            if (durationMs > 0 && bytes) {
                // Weighted average throughput calculation [cite: 413, 853]
                throughputMbps = ((bytes * 8) / (durationMs / 1000) / 1000000).toFixed(3);
            }
        }

        let buffer = player.getBufferLength("video").toFixed(2);
        telemetry.logQoEMetrics(relativeTimeSec, currentBitrate,buffer);
    }
});

const videoElement = document.querySelector("#video-player");
videoElement.muted = true; 
player.initialize(videoElement, STREAM_URL, true);

// Global function for the HTML button
window.downloadTelemetryCSV = () => telemetry.downloadCSV();