import re
import sys
import time
from pathlib import Path

# Ensure UTF-8 output on Windows consoles to prevent UnicodeEncodeError
# Ai recommendation!!!!!!
if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if sys.stderr and hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

from pypdf import PdfReader
from yt_dlp import YoutubeDL
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

SCOPES = ["https://www.googleapis.com/auth/youtube"]
CLIENT_SECRET = "client_secret.json"
TOKEN_FILE = "token.json"


# ----------------------------------------------------------------------------
# 1) Work out the topic of a PDF
# ----------------------------------------------------------------------------
def clean_filename(name: str) -> str:
    """'03_Derivatives-of_functions.pdf' -> 'Derivatives of functions'"""
    name = Path(name).stem
    name = re.sub(r"^\s*(lecture|lec|chapter|ch|week|part|section)?\s*[\d._\-\s]+", "", name, flags=re.I)
    name = re.sub(r"[_\-]+", " ", name)
    return re.sub(r"\s+", " ", name).strip()

def guess_title_from_pdf(pdf_path: Path) -> str:
    """Try the PDF metadata title, then the first meaningful line of page 1."""
    SKIP_PATTERNS = [
        r"university", r"faculty", r"department", r"dept\b", r"preparatory",
        r"selected exercises", r"selected problems", r"assignment", r"homework",
        r"dr\.", r"prof\.", r"prepared by", r"page\s+\d", r"level\s+\d",
        r"kafr\s*el[- ]?sheikh"
    ]
    try:
        reader = PdfReader(str(pdf_path))
        meta_title = (reader.metadata.title or "").strip() if reader.metadata else ""
        if len(meta_title) > 4 and not meta_title.lower().endswith((".doc", ".docx", ".ppt", ".pptx")):
            if not any(re.search(pat, meta_title, re.I) for pat in SKIP_PATTERNS):
                return meta_title
        text = reader.pages[0].extract_text() or ""
        for line in text.splitlines():
            line = line.strip()
            if 4 <= len(line) <= 80 and not re.fullmatch(r"[\d\W]+", line):
                if any(re.search(pat, line, re.I) for pat in SKIP_PATTERNS):
                    continue
                return line
    except Exception:
        pass
    return ""


def topic_for_pdf(pdf_path: Path) -> str:
    from_name = clean_filename(pdf_path.name)
    # Check if filename is generic like "H.W Assignment (10)"
    is_generic = bool(re.search(r"\b(assignment|hw|h\.w|sheet|document|scan|untitled|new)\b", from_name, re.I))
    if is_generic:
        pdf_title = guess_title_from_pdf(pdf_path)
        if pdf_title:
            return pdf_title
    if len(from_name) >= 6 and not is_generic:
        return from_name
    return guess_title_from_pdf(pdf_path) or from_name or pdf_path.stem


# ----------------------------------------------------------------------------
# 2) Search YouTube (yt-dlp = free, no API quota used)
# ----------------------------------------------------------------------------
def search_video(query: str, min_sec=300, max_sec=5400, tries=8):
    """Return (video_id, title) of the first sensible explanation video."""
    opts = {"quiet": True, "extract_flat": True, "skip_download": True}
    with YoutubeDL(opts) as ydl:
        result = ydl.extract_info(f"ytsearch{tries}:{query}", download=False)
    entries = [e for e in (result or {}).get("entries", []) if e and e.get("id")]
    # Prefer videos that are a reasonable length (not 30-second shorts, not 10-hour streams)
    for e in entries:
        dur = e.get("duration")
        if dur and min_sec <= dur <= max_sec:
            return e["id"], e.get("title", "")
    return (entries[0]["id"], entries[0].get("title", "")) if entries else (None, None)


# ----------------------------------------------------------------------------
# 3) YouTube API: login, playlists
# ----------------------------------------------------------------------------
def get_youtube_service():
    """Authenticate with YouTube API if credentials exist, otherwise return None."""
    if not Path(CLIENT_SECRET).exists() and not Path(TOKEN_FILE).exists():
        print(f"\n[Note] '{CLIENT_SECRET}' was not found.")
        print("  Skipping YouTube account playlist creation.")
        print("  Searching YouTube directly via yt-dlp and saving all video links...\n")
        return None
    creds = None
    if Path(TOKEN_FILE).exists():
        creds = Credentials.from_authorized_user_file(TOKEN_FILE, SCOPES)
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        elif Path(CLIENT_SECRET).exists():
            flow = InstalledAppFlow.from_client_secrets_file(CLIENT_SECRET, SCOPES)
            creds = flow.run_local_server(port=0)
            Path(TOKEN_FILE).write_text(creds.to_json())
        else:
            return None
    return build("youtube", "v3", credentials=creds)


def get_or_create_playlist(yt, name: str, privacy="private") -> str:
    """Reuse a playlist with the same name if it exists, otherwise create it."""
    page_token = None
    while True:
        resp = yt.playlists().list(part="snippet", mine=True, maxResults=50, pageToken=page_token).execute()
        for item in resp.get("items", []):
            if item["snippet"]["title"].strip().lower() == name.strip().lower():
                return item["id"]
        page_token = resp.get("nextPageToken")
        if not page_token:
            break
    body = {
        "snippet": {"title": name, "description": f"Auto-generated playlist for {name}"},
        "status": {"privacyStatus": privacy},
    }
    return yt.playlists().insert(part="snippet,status", body=body).execute()["id"]


def video_ids_in_playlist(yt, playlist_id: str) -> set:
    ids, page_token = set(), None
    while True:
        resp = yt.playlistItems().list(
            part="contentDetails", playlistId=playlist_id, maxResults=50, pageToken=page_token
        ).execute()
        ids.update(i["contentDetails"]["videoId"] for i in resp.get("items", []))
        page_token = resp.get("nextPageToken")
        if not page_token:
            return ids


def add_video(yt, playlist_id: str, video_id: str):
    body = {
        "snippet": {
            "playlistId": playlist_id,
            "resourceId": {"kind": "youtube#video", "videoId": video_id},
        }
    }
    yt.playlistItems().insert(part="snippet", body=body).execute()


def save_report_markdown(report: dict, output_file: str = "MyStudies_Videos.md"):
    """Write an organized markdown file and videos_data.js for the web interface."""
    import json
    lines = ["# Study Videos Index\n"]
    js_data = {}
    for subject, videos in report.items():
        lines.append(f"## {subject}\n")
        js_data[subject] = []
        if not videos:
            lines.append("_No videos found._\n")
            continue
        for pdf_name, title, url in videos:
            lines.append(f"- **{pdf_name}**: [{title}]({url})")
            vid_match = re.search(r"youtu\.be/([a-zA-Z0-9_-]+)", url)
            vid_id = vid_match.group(1) if vid_match else ""
            js_data[subject].append({
                "pdf": pdf_name,
                "title": title,
                "url": url,
                "videoId": vid_id
            })
        lines.append("")
    out_path = Path(output_file)
    out_path.write_text("\n".join(lines), encoding="utf-8")
    print(f"\n[Saved] All video links saved to: {out_path.resolve()}")

    # Also update videos_data.js for immediate browser visualization
    js_path = out_path.parent / "videos_data.js"
    js_content = "window.STUDY_VIDEOS_DATA = " + json.dumps(js_data, indent=2, ensure_ascii=False) + ";\n"
    js_path.write_text(js_content, encoding="utf-8")


# ----------------------------------------------------------------------------
# 4) The main function
# ----------------------------------------------------------------------------
def build_playlists(lessons_folder: str, privacy: str = "private", search_suffix: str = "explained lecture"):
    """
    lessons_folder : folder that contains one sub-folder per subject (each with PDFs)
    privacy        : 'private' | 'unlisted' | 'public'
    search_suffix  : words added to every search to find teaching videos
    Returns a dict {subject: [(pdf_name, video_title, video_url), ...]}
    """
    root = Path(lessons_folder)
    if not root.is_dir():
        raise FileNotFoundError(f"Folder not found: {root}")

    subjects = sorted(p for p in root.iterdir() if p.is_dir())
    if not subjects:
        raise ValueError(f"No subject sub-folders found inside '{lessons_folder}'.")

    yt = get_youtube_service()
    report = {}

    for subject_dir in subjects:
        pdfs = sorted(subject_dir.rglob("*.pdf"))
        if not pdfs:
            continue

        subject = subject_dir.name
        print(f"\n=== {subject} ({len(pdfs)} PDFs) ===")
        playlist_id = None
        already = set()

        if yt:
            try:
                playlist_id = get_or_create_playlist(yt, subject, privacy)
                already = video_ids_in_playlist(yt, playlist_id)
            except Exception as e:
                print(f"  [Playlist Warning] Could not manage YouTube playlist: {e}")
                yt = None

        report[subject] = []

        for pdf in pdfs:
            try:
                topic = topic_for_pdf(pdf)
                query = f"{subject} {topic} {search_suffix}"
                vid, title = search_video(query)
                if not vid:
                    print(f"  [no video found] {pdf.name}")
                    continue
                if vid in already:
                    print(f"  [already in {subject}] {pdf.name} -> {title}")
                    continue
                already.add(vid)

                if yt and playlist_id:
                    add_video(yt, playlist_id, vid)
                    print(f"  [added to playlist] {pdf.name} -> {title}")
                else:
                    print(f"  [found] {pdf.name} -> {title} (https://youtu.be/{vid})")
                report[subject].append((pdf.name, title, f"https://youtu.be/{vid}"))
                time.sleep(0.5)  # be gentle with YouTube
            except HttpError as e:
                if "quotaExceeded" in str(e):
                    print("\nDaily YouTube API quota reached. Continuing without playlist sync...")
                    yt = None
                else:
                    print(f"  [API error] {pdf.name}: {e}")
            except Exception as e:
                print(f"  [error] {pdf.name}: {e}")

        if playlist_id:
            print(f"Playlist: https://www.youtube.com/playlist?list={playlist_id}")

        # Save progress after each subject completes
        save_report_markdown(report, "MyStudies_Videos.md")

    save_report_markdown(report, "MyStudies_Videos.md")
    return report


if __name__ == "__main__":
    if len(sys.argv) > 1:
        target_folder = sys.argv[1]
    elif Path("MyStudies").is_dir():
        target_folder = "MyStudies"
    elif Path("downloads").is_dir():
        target_folder = "downloads"
    else:
        print('Usage: python SeeVidFromPDF.py "path/to/lessons_folder"')
        sys.exit(1)

    print(f"Starting process for folder: '{target_folder}'")
    build_playlists(target_folder)
