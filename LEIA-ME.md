# LEEMO para Windows

App de Windows do LEEMO. Ele abre o LEEMO publicado (https://meevo-21vz.onrender.com) numa janela própria, então as atualizações do site chegam sozinhas, sem reinstalar.

- Seletor próprio para transmitir uma tela ou janela, com opção de enviar o som do computador
- Notificações do Windows, ícone no Menu Iniciar e na área de trabalho
- Lembra o tamanho e a posição da janela
- Tela de "sem conexão" com "Tentar de novo"
- Atalhos: F5 recarrega, F11 tela cheia

## Gerar o instalador (pelo GitHub, sem instalar nada no PC)

O arquivo `.github/workflows/build.yml` (a mesma coisa está em `build.yml`) gera o instalador `LEEMO-Setup.exe` no GitHub Actions e publica em **Releases**.

Para lançar uma versão nova do app: aumente a `version` no `package.json` (ex.: 1.0.1) e rode o workflow de novo.

## Gerar no próprio PC (opcional)

Com Node.js instalado, abra a pasta no terminal e rode:

    npm install
    npm run dist

O instalador fica na pasta `dist`.
