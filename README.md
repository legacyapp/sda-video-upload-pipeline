## Configuration
We have to configurate some configuration in local before deploy to Google cloud.

In local, create a `.env` in `functions` folder.
This file must have these keys:
```
MUX_TOKEN_ID={{MUX_TOKEN_ID}}
MUX_TOKEN_SECRET={{MUX_TOKEN_SECRET}}
MEDIAPIPE_SERVICE=https://mediapipe-cloud-run-uqnbbgbvta-uc.a.run.app
POSE_DATA_BUCKET=dev-danceduel.appspot.com
```

{{MUX_TOKEN_ID}} and {{MUX_TOKEN_SECRET}} can get from Mux settings.

## Deploy

Run the following command from the project root

```shell
firebase deploy --only functions
```
