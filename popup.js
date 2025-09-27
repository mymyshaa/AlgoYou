// popup.js
function byFrequency(arr, key='') {
  const counts = {};
  arr.forEach(x => {
    const k = key ? x[key] : x;
    if (!k) return;
    counts[k] = (counts[k] || 0) + 1;
  });
  return Object.entries(counts).sort((a,b)=>b[1]-a[1]);
}

function topKeywordsFromTitles(titles, limit=5) {
  const stop = new Set(['the','a','to','and','in','on','for','with','of','vs','vs.','how','why','is','what']);
  const counts = {};
  titles.forEach(t => {
    t.split(/\W+/).map(w=>w.toLowerCase()).forEach(w=>{
      if (!w || w.length<3) return;
      if (stop.has(w)) return;
      counts[w] = (counts[w]||0)+1;
    });
  });
  return Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,limit).map(x=>x[0]);
}

function topTopicsFromDescriptions(docs, limit = 5) {
  const stop = new Set(['the', 'a', 'to', 'and', 'in', 'on', 'for', 'with', 'of', 'vs', 'vs.', 'how', 'why', 'is', 'what', 'this', 'that', 'it', 'we', 'you', 'he', 'she', 'they', 'i', 'me', 'my', 'myself', 'our', 'ours', 'ourselves', 'your', 'yours', 'yourself', 'yourselves', 'him', 'his', 'himself', 'her', 'hers', 'herself', 'its', 'itself', 'them', 'their', 'theirs', 'themselves', 'about', 'above', 'below', 'from', 'up', 'down', 'out', 'over', 'under', 'again', 'further', 'then', 'once', 'here', 'there', 'when', 'where', 'why', 'how', 'all', 'any', 'both', 'each', 'few', 'more', 'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very', 's', 't', 'can', 'will', 'just', 'don', 'should', 'now', 'd', 'll', 'm', 'o', 're', 've', 'y', 'ain', 'aren', 'couldn', 'didn', 'doesn', 'hadn', 'hasn', 'haven', 'isn', 'ma', 'mightn', 'mustn', 'needn', 'shan', 'shouldn', 'wasn', 'weren', 'won', 'wouldn', 'http', 'https', 'www', 'com', 'youtu', 'watch', 'video', 'channel', 'like', 'subscribe', 'follow', 'more', 'new', 'check', 'get', 'one', 'also', 'see', 'find', 'use', 'make', 'go', 'know', 'look', 'playlist', 'description', 'thanks', 'music', 'buy', 'free', 'download', 'official', 'live', 'stream']);
  const counts = {};
  docs.forEach(doc => {
    doc.split(/\W+/).map(w => w.toLowerCase()).forEach(w => {
      if (!w || w.length < 4 || w.match(/^\d+$/)) return; // Exclude short words and numbers
      if (stop.has(w)) return;
      counts[w] = (counts[w] || 0) + 1;
    });
  });
  return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, limit).map(x => x[0]);
}

async function generateReport() {
  const rEl = document.getElementById('report');
  rEl.textContent = 'Calculating…';

  chrome.storage.local.get({ events: [] }, (res) => {
    const events = res.events || [];
    if (!events.length) { rEl.innerHTML = '<ul><li>No data yet — browse YouTube for a few minutes.</li></ul>'; return; }

    // compute watch time per video
    const watchChunks = events.filter(e=>e.type==='EVENT' ? false : true); // defensive - but our events are stored as objects with .type already
    // events are saved as {type, data, url, ts}
    const watchEvents = events.filter(e => e.type === 'watch_chunk' || e.type === 'play' || e.type === 'ended' || e.type === 'open_watch');
    const watchByVideo = {};
    events.forEach(ev => {
      if (ev.type === 'watch_chunk' && ev.data && ev.data.videoId) {
        const vid = ev.data.videoId;
        watchByVideo[vid] = (watchByVideo[vid] || 0) + (ev.data.ms || 0);
      }
    });

    const watchList = Object.entries(watchByVideo).sort((a,b)=>b[1]-a[1]).slice(0,6).map(([vid,ms]) => ({vid, secs: Math.round(ms/1000)}));

    // recommendations snapshots
    const recSnapshots = events.filter(e => e.type === 'recs_snapshot');
    const recIds = [];
    const recTitles = [];
    recSnapshots.forEach(snap => {
      (snap.data.recs||[]).forEach(r => { recIds.push(r.videoId); if (r.title) recTitles.push(r.title); });
    });

    const topRecs = byFrequency(recIds).slice(0,6).map(x=>`${x[0]} (${x[1]} times)`);
    const keywords = topKeywordsFromTitles(recTitles, 6);

    // diversity: unique recommended video ids / total recs
    const uniqueRecs = new Set(recIds);
    const diversity = recIds.length ? Math.round((uniqueRecs.size / recIds.length) * 100) : 100;

    // searches
    const searches = events.filter(e => e.type === 'search').map(e=>e.data.query);
    const topSearches = byFrequency(searches).slice(0,5).map(x=>`${x[0]} (${x[1]})`);

    // video descriptions
    const descriptionEvents = events.filter(e => e.type === 'video_description');
    const descriptions = descriptionEvents.map(e => e.data.description);
    const topTopics = topTopicsFromDescriptions(descriptions, 6);

    // Build bullet report
    const bullets = [];
    bullets.push(`<strong>Total events collected:</strong> ${events.length}`);
    if (watchList.length) {
      bullets.push(`<strong>Top watched videos (id — seconds watched):</strong> ${watchList.map(w=>w.vid + ' — ' + w.secs + 's').join('; ')}`);
    } else {
      bullets.push(`<strong>Top watched videos:</strong> no recorded watch chunks yet.`);
    }
    bullets.push(`<strong>Top recommended items observed:</strong> ${topRecs.length ? topRecs.join('; ') : 'none yet'}`);
    bullets.push(`<strong>Top keywords in recommended titles:</strong> ${keywords.join(', ') || '—'}`);
    bullets.push(`<strong>Top topics in video descriptions:</strong> ${topTopics.join(', ') || '—'}`);
    bullets.push(`<strong>Recommendation diversity score:</strong> ${diversity}% (higher = more diverse)`);
    bullets.push(`<strong>Top search queries:</strong> ${topSearches.length ? topSearches.join('; ') : 'none yet'}`);

    rEl.innerHTML = '<ul style="padding-left:16px; margin:0">' + bullets.map(b=>`<li style="margin:6px 0">${b}</li>`).join('') + '</ul>';
  });
}

document.getElementById('refreshBtn').addEventListener('click', generateReport);
document.getElementById('clearBtn').addEventListener('click', () => {
  if (!confirm('Delete all stored events? This cannot be undone.')) return;
  chrome.runtime.sendMessage({ type: 'CLEAR' }, (resp) => { generateReport(); });
});
document.getElementById('exportBtn').addEventListener('click', () => {
  chrome.storage.local.get({ events: [] }, (res) => {
    const data = res.events || [];
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'youtube-inspector-events.json';
    a.click();
    URL.revokeObjectURL(url);
  });
});

// generate on open
generateReport();
