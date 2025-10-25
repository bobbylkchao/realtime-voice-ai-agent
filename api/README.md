# Simple Express API with OpenAI

**Require: Node >= 16**

## Install Dependencies & Setup Environment  

```sh
cd ./api
npm i
cp ./.env.example .env
```

### OpenAI API Configuration

Configure OpenAI API settings in .env:

```
OPENAI_API_KEY=
OPENAI_ORGANIZATION_ID=
OPENAI_PROJECT_ID=
OPENAI_MODEL=gpt-3.5-turbo
```

## Start API Application

```
npm run dev
```

## API Endpoints

- Server: http://localhost:4000
- Basic Express server with OpenAI client initialization
