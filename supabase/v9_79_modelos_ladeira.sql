-- AdvOS v9.79 - Modelos oficiais Ladeira Advogados
-- Semeia modelos limpos derivados dos documentos fornecidos pelo escritório, sem dados pessoais dos exemplos.

insert into public.document_templates (law_firm_id, name, category, content, active)
select lf.id,
       'Ladeira Advogados - Contrato de Prestação de Serviços Advocatícios (Oficial)',
       'Contrato de honorários',
$TEMPLATE$
LADEIRA ADVOGADOS
CONTRATO DE PRESTAÇÃO DE SERVIÇOS ADVOCATÍCIOS

CONTRATANTE: {{cliente_qualificacao}}

CONTRATADO: {{escritorio_qualificacao}}

As partes acima identificadas têm, entre si, justo e acertado o presente Contrato de Honorários Advocatícios, que se regerá pelas cláusulas e pelas condições a seguir descritas.

DO OBJETO DO CONTRATO
Cláusula 1ª. O presente contrato tem como objeto a prestação de serviços advocatícios visando {{objeto}}

DAS ATIVIDADES
Cláusula 2ª. O CONTRATADO deverá praticar todos os atos relacionados ao exercício da advocacia, obrigações tipicamente de meio, particularmente aqueles constantes no Estatuto da Ordem dos Advogados do Brasil, assim como o que for especificado na outorga da procuração, com a diligência habitual que se presume da atuação profissional.

DOS ATOS PROCESSUAIS
Cláusula 3ª. A gestão do processo correrá por conta e responsabilidade do CONTRATADO, podendo, se necessário, substabelecer os poderes que lhe foram conferidos pelo CONTRATANTE a outro advogado.

DAS DESPESAS
Cláusula 4ª. Ao CONTRATANTE caberá ainda, se necessário, o pagamento das custas judiciais, em caso de indeferimento do benefício da AJG.

DOS HONORÁRIOS
Cláusula 5ª. O CONTRATANTE, como contraprestação pelos serviços prestados, concorda em remunerar o CONTRATADO no valor total de {{valor_total_extenso}} ({{valor_total}}). {{pagamento_detalhado}}

Parágrafo primeiro. O adimplemento dos valores ajustados na presente cláusula será feito exclusivamente através de boleto bancário ou PIX a ser expedido diretamente pelo CONTRATANTE.

{{clausula_exito}}

Cláusula 6ª. Os eventuais honorários de sucumbência pertencem ao CONTRATADO e não se confundem com os honorários contratuais aqui tratados.

Parágrafo único. Caso haja morte ou incapacidade civil do CONTRATADO, seus sucessores ou representante legal receberão os honorários na proporção do trabalho realizado.

Cláusula 7ª. Havendo acordo entre o CONTRATANTE e a parte contrária ou desistência pelo CONTRATANTE, este fato não prejudicará o recebimento de todos os honorários contratados e da sucumbência, se houver, pelo CONTRATADO.

Cláusula 8ª. O atraso no pagamento dos honorários ensejará multa no valor de 10% (dez por cento) sobre o valor devido e serão cobrados juros de mora na proporção de 5% (cinco por cento) ao mês, devidamente atualizados pelo IGPM + 1%.

Parágrafo primeiro. Caso a mora seja superior a 30 (trinta) dias, serão consideradas vencidas as demais obrigações vincendas, que serão exigidas de imediato.

Parágrafo segundo. Na hipótese do parágrafo anterior, se houver a liberalidade do CONTRATADO, este contrato poderá ser rescindido de pleno direito, independentemente de qualquer medida judicial ou extrajudicial.

Parágrafo terceiro. Havendo a necessidade de propor-se ação judicial para cobrança dos honorários aqui estabelecidos, o valor principal será atualizado monetariamente pelo IGPM, com acréscimo de juros de 5% ao mês, multa de 10% sobre o valor a ser executado e honorários advocatícios na execução no percentual de 20% sobre o valor cobrado naquela demanda.

DA VIGÊNCIA E DA RESCISÃO
Cláusula 9ª. Este contrato tem vigência até o adimplemento das obrigações ajustadas e pode ser rescindido a qualquer tempo por qualquer das partes, mediante aviso prévio de 30 (trinta) dias, por escrito e com comprovante de entrega.

Parágrafo primeiro. Na hipótese de rescisão antecipada pelo CONTRATANTE, este deverá pagar multa contratual no valor de {{multa_rescisao}} , bem como, para os valores pro êxito, um percentual correspondente à parcela do serviço que foi executada pelo CONTRATADO.

Parágrafo segundo. Na hipótese de rescisão antecipada pelo CONTRATADO, haverá cobrança de honorários proporcionais aos serviços prestados.

Parágrafo terceiro. A prestação do serviço será iniciada após o efetivo pagamento do valor de entrada pactuado na Cláusula 5ª.

DA RESPONSABILIDADE
Cláusula 10ª. O CONTRATADO não será responsabilizado por quaisquer danos que sobrevierem das demandas que patrocinar, cabendo-lhe tão somente o emprego diligente de seus conhecimentos, meios e técnicas para a defesa dos interesses do CONTRATANTE, inexistente qualquer garantia de resultado.

Cláusula 11ª. O CONTRATADO não será responsabilizado acaso resultem danos por não tomar conhecimento de informações e documentos substanciais para a sua atividade ou em decorrência da impossibilidade de contato com o CONTRATANTE, que deverá manter atualizadas quaisquer informações relevantes para a demanda, bem como as informações cadastrais fornecidas por aquele.

Cláusula 12ª. É obrigação do CONTRATANTE, sempre que solicitada, entregar, fornecer ou disponibilizar ao CONTRATADO todos os documentos necessários, provas, informações e subsídios, em tempo hábil, para que este possa cumprir o objeto do presente contrato. Qualquer omissão ou negligência por parte do CONTRATANTE será de sua inteira responsabilidade, caso advenha qualquer prejuízo a seus interesses.

DA SUSPENSÃO DOS SERVIÇOS
Cláusula 13ª. Em caso de não pagamento das parcelas dentro do prazo estipulado, fica ao contratado o direito de suspender, automaticamente, a prestação dos serviços em andamento, até que a situação seja regularizada, observadas as regras legais e éticas aplicáveis.

DO FORO
Cláusula 14ª. Para dirimir quaisquer controvérsias oriundas deste contrato, as partes elegem o foro da comarca de {{foro}}.

Por estarem assim justos e contratados, firmam o presente instrumento, em duas vias de igual teor.

{{local}}, {{data_extenso}}

__________________________________________
{{cliente_nome}}
CONTRATANTE

__________________________________________
{{contratado_assinatura}}
CONTRATADO
$TEMPLATE$,
       true
from public.law_firms lf
where not exists (
  select 1 from public.document_templates dt where dt.law_firm_id = lf.id and dt.name = 'Ladeira Advogados - Contrato de Prestação de Serviços Advocatícios (Oficial)'
);

insert into public.document_templates (law_firm_id, name, category, content, active)
select lf.id,
       'Ladeira Advogados - Procuração (Oficial)',
       'Procuração',
$TEMPLATE$
LADEIRA ADVOGADOS
PROCURAÇÃO

OUTORGANTE: {{cliente_qualificacao}}

OUTORGADOS: {{outorgados}}

PODERES
O OUTORGANTE nomeia e constitui o OUTORGADO seu procurador; onde este se apresentar, outorgando-lhe os necessários poderes para representá-lo, em juízo ou fora dele, junto à ação em que é réu, podendo, nesta ação, e tudo praticar, requerer, assinar, com poderes para transigir, desistir, reconvir, discordar, ratificar, retificar, receber quantias e intimações, dar quitação, propor contraposição, acompanhar quaisquer recursos em todos os termos ou instâncias, responder perante qualquer repartição pública ou privada, autarquia ou órgão federal, estadual ou municipal no que se refere a esta ação em específico, e ainda praticar todos os demais atos que se fizerem necessários ao integral cumprimento do presente mandato, para o que confere os mais amplos poderes, bem como os contidos na cláusula “ad judicia”, podendo, ainda, substabelecer, no todo ou em parte, com ou sem reserva, os poderes ora conferidos, que se destinam especialmente para fim de representação do outorgante na {{objeto}}, bem como para interpor RECURSOS ADMINISTRATIVOS contra o DETRAN, DAER, DER, DNIT, PRF e PREFEITURAS MUNICIPAIS.

{{declaracao_hipossuficiencia}}

{{local_em_maiusculas}}, {{data_extenso}}

__________________________________________
{{cliente_nome}}
outorgante
$TEMPLATE$,
       true
from public.law_firms lf
where not exists (
  select 1 from public.document_templates dt where dt.law_firm_id = lf.id and dt.name = 'Ladeira Advogados - Procuração (Oficial)'
);

-- Os modelos são protegidos por RLS e administrados pelo backend do AdvOS.
alter table public.document_templates enable row level security;
revoke all on table public.document_templates from public, anon, authenticated;
grant all privileges on table public.document_templates to service_role;
