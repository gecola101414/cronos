
declare const google: any;
declare const gapi: any;

// NOTE: Replace these with your actual Google Cloud Console credentials
const CLIENT_ID = 'YOUR_GOOGLE_CLIENT_ID'; 
const API_KEY = 'YOUR_GOOGLE_API_KEY'; 

// Discovery doc URL for APIs used by the quickstart
const DISCOVERY_DOC = 'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest';

// Authorization scopes required by the API; multiple scopes can be
// included, separated by spaces.
const SCOPES = 'https://www.googleapis.com/auth/drive.file';

let tokenClient: any;
let gapiInited = false;
let gisInited = false;

export async function saveToGoogleDrive(fileName: string, content: string): Promise<void> {
    return new Promise(async (resolve, reject) => {
        if (!CLIENT_ID || !API_KEY || CLIENT_ID === 'YOUR_GOOGLE_CLIENT_ID') {
            reject(new Error("Google Client ID and API Key are missing in services/googleDriveService.ts"));
            return;
        }

        const maybeInitGapi = async () => {
            if (gapiInited) return;
            await new Promise<void>((res, rej) => {
                gapi.load('client', {
                    callback: () => res(),
                    onerror: () => rej("GAPI failed to load")
                });
            });
            await gapi.client.init({
                apiKey: API_KEY,
                discoveryDocs: [DISCOVERY_DOC],
            });
            gapiInited = true;
        };

        const maybeInitGis = () => {
            if (gisInited) return;
            tokenClient = google.accounts.oauth2.initTokenClient({
                client_id: CLIENT_ID,
                scope: SCOPES,
                callback: '', // defined later
            });
            gisInited = true;
        };

        try {
            if (typeof gapi === 'undefined' || typeof google === 'undefined') {
                throw new Error("Google API scripts not loaded. Check index.html");
            }

            await maybeInitGapi();
            maybeInitGis();

            // Request Access Token
            tokenClient.callback = async (resp: any) => {
                if (resp.error) {
                    reject(resp);
                    return;
                }
                
                // Create File
                try {
                    const boundary = '-------314159265358979323846';
                    const delimiter = "\r\n--" + boundary + "\r\n";
                    const close_delim = "\r\n--" + boundary + "--";

                    const contentType = 'application/json';
                    const metadata = {
                        'name': fileName,
                        'mimeType': contentType
                    };

                    const multipartRequestBody =
                        delimiter +
                        'Content-Type: application/json\r\n\r\n' +
                        JSON.stringify(metadata) +
                        delimiter +
                        'Content-Type: ' + contentType + '\r\n\r\n' +
                        content +
                        close_delim;

                    const request = gapi.client.request({
                        'path': '/upload/drive/v3/files',
                        'method': 'POST',
                        'params': {'uploadType': 'multipart'},
                        'headers': {
                            'Content-Type': 'multipart/related; boundary="' + boundary + '"'
                        },
                        'body': multipartRequestBody
                    });

                    const response = await request;
                    if(response.result && response.result.id) {
                        alert(`File salvato su Drive con ID: ${response.result.id}`);
                        resolve();
                    } else {
                        reject(new Error("Upload failed"));
                    }

                } catch (err) {
                    reject(err);
                }
            };

            if (gapi.client.getToken() === null) {
                // Prompt the user to select a Google Account and ask for consent to share their data
                // when establishing a new session.
                tokenClient.requestAccessToken({prompt: 'consent'});
            } else {
                // Skip display of account chooser and consent dialog for an existing session.
                tokenClient.requestAccessToken({prompt: ''});
            }

        } catch (err: any) {
            console.error("Drive Error", err);
            reject(err);
        }
    });
}
