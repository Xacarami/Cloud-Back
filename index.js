const express = require('express');
const multer = require('multer');
const cors = require('cors');
const fs = require('fs');
const sql = require('mssql');
const { BlobServiceClient } = require('@azure/storage-blob');
require('dotenv').config();

const app = express();
const PORTA = process.env.PORT || 3000;

// Configurações iniciais do servidor
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Upload temporário local
const armazenamentoLocal = multer({ dest: 'temporario/' });

// Azure Blob Service instanciado
const clienteBlob = BlobServiceClient.fromConnectionString(process.env.STORAGE_CONNECTION_STRING);
const containerAlvo = clienteBlob.getContainerClient('documentos');

// Credenciais do banco de dados
const configBanco = {
  user: process.env.SQL_USER,
  password: process.env.SQL_PASSWORD,
  database: process.env.SQL_DATABASE,
  server: process.env.SQL_SERVER,
  pool: {
    max: 5,
    min: 0,
    idleTimeoutMillis: 30000
  },
  options: {
    encrypt: true,
    trustServerCertificate: false
  }
};

// Envia o arquivo para o Azure Blob Storage
async function enviarArquivoParaNuvem(caminhoArquivo, nomeDoArquivo) {
  const blobIndividual = containerAlvo.getBlockBlobClient(nomeDoArquivo);
  const resultadoEnvio = await blobIndividual.uploadFile(caminhoArquivo);
  console.log(`Documento enviado com sucesso. ID da requisição: ${resultadoEnvio.requestId}`);
}

// Insere os dados da matrícula no banco
async function registrarDadosDaMatricula(nomeAluno, contatoEmail, nomeCurso) {
  try {
    await sql.connect(configBanco);
    await sql.query`INSERT INTO matriculas (nome, email, curso) VALUES (${nomeAluno}, ${contatoEmail}, ${nomeCurso})`;
    console.log("Informações da matrícula registradas no banco de dados.");
  } catch (falha) {
    console.error("Erro ao registrar no banco:", falha);
  }
}

// Rota principal de recebimento de matrícula
app.post('/matricula', armazenamentoLocal.single('documento'), async (req, res) => {
  const { nome, email, curso } = req.body;
  const documentoRecebido = req.file;

  if (!documentoRecebido) {
    return res.status(400).json({ erro: 'O envio do documento é obrigatório.' });
  }

  try {
    await enviarArquivoParaNuvem(documentoRecebido.path, documentoRecebido.originalname);
    await registrarDadosDaMatricula(nome, email, curso);
    fs.unlinkSync(documentoRecebido.path);

    res.json({
      mensagem: `Olá, ${nome}! Recebemos seu documento e estamos iniciando o processo de matrícula.`,
      status: 'em análise'
    });
  } catch (falha) {
    console.error(falha);
    res.status(500).json({ erro: 'Falha ao processar a matrícula. Tente novamente mais tarde.' });
  }
});

// Inicialização do servidor
app.listen(PORTA, () => {
  console.log(`🚀 Servidor pronto e escutando em http://localhost:${PORTA}`);
});
