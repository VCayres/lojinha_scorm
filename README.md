# Lojinha do Ed — primeira versão SCORM

Adaptação da aplicação de educação fiscal de [VCayres/lojinha-do-ed](https://github.com/VCayres/lojinha-do-ed), baseada no commit `06f41fcfc257ea6d327ac16f16aadf08e28605d7`. Preserva os 25 produtos, preços, imagens e banner da referência, o carrinho e a emissão de nota fiscal simulada. O repositório original não foi alterado.

## O que esta versão faz

- Permite adicionar produtos, ajustar quantidades e gerar uma nota fiscal educativa, inclusive no celular.
- Apresenta a estimativa de impostos de 20% **incluída** no preço, como no simulador original; não soma impostos ao total e não representa alíquotas reais.
- Imprime a nota pela impressão do navegador, sem depender de uma nova janela.
- Conecta ao LMS usando **SCORM 1.2**, registrando progresso e tempo da sessão.
- Retoma o carrinho e a última nota em `cmi.suspend_data`; números e datas da nota são mantidos ao retomá-la. Alterar o carrinho exige gerar uma nova nota.
- Registra `incomplete` ao iniciar e `completed` ao clicar em **Concluir atividade** na nota. Não calcula nota nem registra `passed`/`failed`, pois a aplicação original não tem avaliação. Depois da conclusão, permite continuar explorando sem desfazer o registro.
- Mostra falhas de salvamento e permite tentar novamente. Fora do LMS, funciona em modo livre, usando armazenamento local quando disponível.

A conclusão confirma que o participante gerou uma nota e acionou a conclusão. Não avalia aprendizagem, leitura ou domínio dos conceitos. A pequena reflexão sobre educação fiscal é uma introdução desta adaptação, sem questionário pontuado.

## Executar localmente

A aplicação é HTML, CSS e JavaScript estáticos, sem dependências de produção, login, banco de dados ou serviços externos obrigatórios. Python 3.9 ou superior é suficiente para servir e empacotar.

```sh
cd /workspace/lojinha_scorm
python3 -m http.server 8000 --bind 0.0.0.0
```

Em execução sem LMS, a interface identifica o **modo livre**. O progresso é específico deste navegador/origem e não será transferido automaticamente para um curso. A aplicação não registra service worker, para evitar conflitos de cache ou de escopo com o LMS. Toda arte necessária está no pacote; só o link opcional para o portal Educação Fiscal PR usa um site externo.

## Gerar o pacote SCORM

```sh
cd /workspace/lojinha_scorm
python3 scripts/package_scorm.py
```

Saída: `dist/lojinha-do-ed-scorm12.zip`, com `imsmanifest.xml` na raiz. O empacotador valida a presença dos arquivos declarados e a integridade do ZIP, e inclui somente os arquivos do SCO e suas 27 imagens. A pasta `dist` é ignorada pelo Git; gere o pacote novamente quando alterar a aplicação.

No LMS, crie uma atividade SCORM e envie **o ZIP inteiro**, sem descompactar. Configure a conclusão para considerar o status SCORM **completed**, sem exigir nota mínima. Esta versão não oferece SCORM 2004 ou xAPI.

## Validação

Testes reais de navegador, com Playwright e Chromium:

```sh
python3 -m pip install playwright
python3 -m playwright install chromium
python3 -m unittest discover -s tests -v
```

Se o sistema já tiver Chromium, os testes o detectam. Para outro caminho, defina `CHROMIUM_EXECUTABLE`. Playwright é uma dependência de desenvolvimento; não vai no ZIP.

Os testes verificam catálogo, total do carrinho, impostos incluídos, nota, impressão, retomada local, execução em iframe com API SCORM simulada, retomada no LMS simulado, conclusão, ausência de nota fictícia, encerramento, falhas de gravação e recuperação, dados inválidos, imagens, celular, teclado e integridade do pacote.

**Validação pendente de implantação:** importar o pacote no LMS de destino e verificar, com uma conta de aluno, abertura, retomada após fechar a atividade, registro de conclusão e impressão. A API usada nos testes é uma simulação; não substitui a verificação no LMS real. Sandbox do LMS pode restringir impressão ou abertura de links.

## Arquivos principais

| Arquivo | Função |
| --- | --- |
| `index.html` | Loja, carrinho, instruções e nota fiscal |
| `style.css` | Estilos originais e ajustes responsivos/acessíveis |
| `script.js` | Catálogo, valores em centavos, carrinho, nota e estado |
| `scorm.js` | Descoberta de API SCORM 1.2, inicialização, gravação e encerramento |
| `imsmanifest.xml` | Declaração do SCO e arquivos do pacote |
| `assets/` | Imagens copiadas da aplicação de referência |
| `scripts/package_scorm.py` | Geração do ZIP sem dependências externas |
| `tests/test_browser.py` | Testes de navegador e empacotamento |

Esta é uma primeira versão baseada no código de referência, sem pressupor requisitos de conversas anteriores que não estavam disponíveis nesta sessão.
