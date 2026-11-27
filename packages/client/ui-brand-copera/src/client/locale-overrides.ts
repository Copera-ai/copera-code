/**
 * Copera Code replacements for upstream dictionary entries, applied through
 * `ctx.locale.override` for the two offered languages. Entries cover every
 * English or Portuguese string of a namespace active in the `copera` profile
 * that names the upstream product (DeepSeek Harness, DSH) or the DeepSeek
 * account, plus the Portuguese entries written in European rather than
 * Brazilian Portuguese. File names, storage keys, and skill ids (`dsh-doc`,
 * `.dsh-created-plugins/`, `dsh.keybindings.v1`) are identifiers and stay
 * verbatim.
 */

/** Languages Copera Code offers. */
export type OverrideLanguage = 'en' | 'pt'

/** Replacement entries for one namespace, by language. */
export type NamespaceOverrides = Readonly<Partial<Record<OverrideLanguage, Readonly<Record<string, string>>>>>

/** Override languages in application order. */
export const OVERRIDE_LANGUAGES: readonly OverrideLanguage[] = ['en', 'pt']

/** Replacement entries keyed by namespace. */
export const LOCALE_OVERRIDES: Readonly<Record<string, NamespaceOverrides>> = {
  common: {
    en: { 'brand.localBuild': 'Copera Code local build' },
    pt: { 'brand.localBuild': 'Versão local do Copera Code' },
  },
  shortcuts: {
    en: {
      future: 'Shortcut configuration in {location} was created by a newer version. Upgrade Copera Code and try again.',
      'desktop-reload': 'restart Copera Code',
    },
    pt: {
      future: 'A configuração de atalhos em {location} foi criada por uma versão mais recente. Atualize o Copera Code e tente novamente.',
      application: 'Aplicativo',
    },
  },
  sidebarOffice: {
    en: { unavailable: 'Office previews are unavailable. Enable the document preview service on the computer running Copera Code.' },
    pt: { unavailable: 'As visualizações do Office não estão disponíveis. Ative o serviço de visualização de documentos no computador que executa o Copera Code.' },
  },
  sidebarBrowser: {
    en: { 'error.application-origin': 'The embedded browser cannot open the Copera Code application itself.' },
    pt: { 'error.application-origin': 'O navegador incorporado não pode abrir o próprio aplicativo Copera Code.' },
  },
  remoteConnection: {
    en: { addressDescription: 'Use the methods below to sign in to Copera Code on another device.' },
    pt: {
      addressDescription: 'Use os métodos abaixo para entrar no Copera Code em outro dispositivo.',
      'pairing.title': 'Solicitações de pareamento',
      'pairing.description': 'Abra este aplicativo no outro dispositivo e solicite o pareamento. Compare os códigos antes de aprovar.',
      'pairing.permission': 'A aprovação dá a esse navegador acesso completo a este aplicativo, incluindo a possibilidade de aprovar outros dispositivos.',
      'pairing.code': 'Código de pareamento',
      'pairing.loading': 'Carregando solicitações de pareamento',
      'pairing.readFailed': 'Não foi possível carregar as solicitações. Tente novamente para atualizar a lista.',
      'pairing.approved': 'Solicitação aprovada',
      'pairing.denied': 'Solicitação recusada',
      'pairing.unavailable': 'Esta solicitação não está mais aguardando aprovação',
    },
  },
  conversation: {
    en: { 'error.sessionInUse': 'This session is already in use, possibly by another running Copera Code instance (such as copera-code in a terminal or the desktop app). Quit other running Copera Code instances and try again.' },
    pt: { 'error.sessionInUse': 'Esta sessão já está em uso, possivelmente por outra instância do Copera Code em execução (como o copera-code em um terminal ou o aplicativo para desktop). Feche as outras instâncias do Copera Code e tente novamente.' },
  },
  chat: {
    en: {
      'message.failure.accountSignedOut': 'Stopped because you signed out of Copera.',
      'message.failure.interrupted': 'The Copera Code process exited before this turn finished (for example, it was killed, crashed, or timed out while shutting down), so the turn was closed when Copera Code restarted. Unfinished tool calls have unknown outcomes.',
      'message.failure.accountSignInRequired': 'Sign in to Copera and ensure the request destination supports account authentication.',
      'message.failure.auth': 'The Copera access token was rejected. Sign in to Copera Code again, or check COPERA_CODE_TOKEN.',
    },
    pt: {
      'message.failure.accountSignedOut': 'Interrompido porque você saiu da sua conta Copera.',
      'message.failure.interrupted': 'O processo do Copera Code foi encerrado antes do fim deste turno (por exemplo, foi finalizado à força, travou ou excedeu o tempo limite ao desligar), então o turno foi encerrado quando o Copera Code reiniciou. Chamadas de ferramentas não concluídas têm resultado desconhecido.',
      'message.failure.accountSignInRequired': 'Entre na sua conta Copera e verifique se o destino da solicitação aceita autenticação de conta.',
      'message.failure.auth': 'O token de acesso da Copera foi recusado. Entre de novo no Copera Code ou verifique COPERA_CODE_TOKEN.',
    },
  },
  trajectory: {
    en: { 'details.failure.auth': 'The Copera access token was rejected. Sign in to Copera Code again, or check COPERA_CODE_TOKEN.' },
    pt: { 'details.failure.auth': 'O token de acesso da Copera foi recusado. Entre de novo no Copera Code ou verifique COPERA_CODE_TOKEN.' },
  },
  actionCards: {
    en: { 'settings.description': 'Shows recommendation cards below the answer for what you want from Copera Code' },
    pt: { 'settings.description': 'Mostra cartões de recomendação abaixo da resposta para suas necessidades personalizadas no Copera Code' },
  },
  creationRecommendations: {
    en: { 'restart-required': 'The change is saved. Restart Copera Code to apply it.' },
    pt: { 'restart-required': 'A alteração foi salva. Reinicie o Copera Code para aplicá-la.' },
  },
  pluginRecommendations: {
    en: {
      'version-error': 'This plugin is incompatible with this Copera Code version. Update Copera Code and retry.',
      'restart-required': 'Saved. Restart Copera Code to apply.',
    },
    pt: {
      'version-error': 'Este plug-in não é compatível com esta versão do Copera Code. Atualize o Copera Code e tente novamente.',
      'restart-required': 'Salvo. Reinicie o Copera Code para aplicar.',
    },
  },
  'schedule.manager': {
    en: {
      'recommend.pluginCompat.description': 'When a new Copera Code version ships, check whether installed and self-made plugins need changes.',
      'recommend.pluginCompat.prompt': 'Create an automation task named "Plugin compatibility check": every day at 10:00, check whether a new Copera Code version is available; if so, read its upgrade guide, check whether each non-official or self-made plugin I have installed is affected, and list what to change and how.',
    },
    pt: {
      'recommend.pluginCompat.description': 'Quando sai uma nova versão do Copera Code, verifica se os plug-ins instalados e os criados por você precisam de ajustes.',
      'recommend.pluginCompat.prompt': 'Crie uma tarefa de automação chamada “Compatibilidade de plug-ins”: todos os dias às 10:00, verifique se há uma nova versão do Copera Code; se houver, leia o guia de atualização dessa versão, confira um a um se os plug-ins não oficiais ou criados por mim que tenho instalados são afetados e liste o que mudar e como.',
    },
  },
  model: {
    en: {
      'provider.account': 'Copera account',
      'error.sessionInUse': 'This session is already in use, possibly by another running Copera Code instance (such as copera-code in a terminal or the desktop app). Quit other running Copera Code instances and try again.',
    },
    pt: {
      'provider.account': 'Conta Copera',
      'error.sessionInUse': 'Esta sessão já está em uso, possivelmente por outra instância do Copera Code em execução (como o copera-code em um terminal ou o aplicativo para desktop). Feche as outras instâncias do Copera Code e tente novamente.',
    },
  },
  'settings.agentPreset': {
    en: {
      guideStandardExplanation: '### How it works\n\nThe agent calls tools directly to read and edit files, search, and run terminal commands. It includes Skills, planning, goals, subagents, workflows, plugin management, read-only runtime inspection, and context compaction.\n\nFor questions about Copera Code and plugin or preset work you request, the dsh-doc skill guides the agent to the installed documentation and source. Its instructions load only when requested or relevant; loading it does not change files, tools, or the profile.\n\n### When to choose it\n\nStart here for everyday coding, file work, and research. Standard mode can also write scripts and process files in batches. PTC changes how tool calls are organized; it is not required for batch tasks.',
      guideCordisExplanation: '### What you can create\n\nCreator mode focuses on customizing Copera Code. It shares read-only runtime inspection and dsh-doc guidance with Standard mode. The agent can create a plugin that adds a capability or UI, or a preset that combines tools and prompts for a particular job.\n\n### Plugins and modes\n\nA plugin adds capabilities to Copera Code, such as a tool, a service connection, or a UI entry. A mode is an agent preset that selects tools and defines how the agent works in a task. A plugin can be included in a custom preset.\n\n### How the result takes effect\n\nAsk the agent to install and verify the result, not just generate source code. A plugin may load immediately or require a restart, depending on what it changes. A newly created preset is selected when starting a new task.',
      guideCordisUsage: '### Add a UI\n\n> Create a Copera Code plugin that adds a project notes entry to the sidebar. Let me browse the Markdown files in this workspace and preview a selected note. Install it and verify that the page opens.\n\nExpected output: an installed plugin with a working entry and preview page, plus any remaining activation steps.\n\n### Add a tool\n\n> Create a plugin with a tool that reads this project’s test report and summarizes the failed tests. Register it and verify it with a sample report.\n\nExpected output: a plugin with a callable tool and a verified sample call.\n\n### Create my own mode\n\n> Create a “Code review” mode based on Standard mode. Have it prioritize potential bugs and test gaps, cite file paths and lines, and ask before modifying files. Save it as a selectable preset.\n\nExpected output: a custom preset for new tasks. These review instructions guide the agent; permission settings determine which actions it can execute.',
      sectionIntro: 'Choose the agent’s tools and how it works. Use Standard mode for everyday tasks, or Creator mode to add capabilities to Copera Code.',
      presetCordisDescription: 'Customize Copera Code through conversation. Let the agent write plugins that add features or UI, or combine tools and prompts to create your own mode.',
      createPluginDescription: 'Enter Creator mode and make your own Copera Code plugin',
    },
    pt: {
      guideCordisExplanation: '### O que você pode criar\n\nO modo Criador se concentra na personalização do Copera Code. Ele compartilha a inspeção de tempo de execução somente leitura e a orientação do dsh-doc com o modo Padrão. O agente pode criar um plug-in que adicione um recurso ou uma interface, ou uma predefinição que combine ferramentas e prompts para um trabalho específico.\n\n### Plug-ins e modos\n\nUm plug-in adiciona recursos ao Copera Code, como uma ferramenta, uma conexão de serviço ou uma entrada na interface. Um modo é uma predefinição de agente que seleciona ferramentas e define como o agente trabalha em uma tarefa. Um plug-in pode ser incluído em uma predefinição personalizada.\n\n### Como o resultado entra em vigor\n\nPeça ao agente para instalar e verificar o resultado, não apenas gerar o código-fonte. Um plug-in pode carregar imediatamente ou exigir uma reinicialização, dependendo do que for alterado. Uma predefinição recém-criada é selecionada ao iniciar uma nova tarefa.',
      guideCordisUsage: '### Adicionar uma interface\n\n> Crie um plug-in do Copera Code que adicione uma entrada de notas do projeto à barra lateral. Quero navegar pelos arquivos Markdown desta área de trabalho e visualizar uma nota selecionada. Instale-o e verifique se a página abre.\n\nResultado esperado: um plug-in instalado com uma entrada funcional e uma página de visualização, além das etapas de ativação que ainda faltarem.\n\n### Adicionar uma ferramenta\n\n> Crie um plug-in com uma ferramenta que leia o relatório de testes deste projeto e resuma os testes que falharam. Registre-o e verifique-o com um relatório de exemplo.\n\nResultado esperado: um plug-in com uma ferramenta que pode ser chamada e uma chamada de exemplo verificada.\n\n### Criar meu próprio modo\n\n> Crie um modo “Revisão de código” baseado no modo Padrão. Faça com que ele priorize possíveis bugs e lacunas de testes, cite caminhos e linhas de arquivos e pergunte antes de modificar arquivos. Salve-o como uma predefinição selecionável.\n\nResultado esperado: uma predefinição personalizada para novas tarefas. Estas instruções de revisão orientam o agente; as configurações de permissão determinam quais ações ele pode executar.',
      sectionIntro: 'Escolha as ferramentas do agente e como ele trabalha. Use o modo Padrão para tarefas do dia a dia ou o modo Criador para adicionar recursos ao Copera Code.',
      presetCordisDescription: 'Personalize o Copera Code conversando. Deixe o agente escrever plug-ins que adicionem recursos ou interface, ou combine ferramentas e prompts para criar seu próprio modo.',
      createPluginDescription: 'Entre no modo Criador e crie seu próprio plug-in do Copera Code',
    },
  },
}
