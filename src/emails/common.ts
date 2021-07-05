import moment from 'moment';
import { c } from '../utils/misc';
import { Application } from '../domain/interface';

export type UILinksInfo = {
  baseUrl: string,
  pathTemplate: string,
};

export type ComposeArgs = {
  receiver: Receiver;
  message: string ;
  includeClousre?: boolean;
  closureData?: ClosureData;
};

export type ClosureData = { guideText: string; guideLink: string; };
const defaultTextStyle = {
  color: '#000000',
  'font-size': '14px',
  'padding': '0'
};

export function compose(cardData: ComposeArgs, subject: string) {
  return `
    <mjml>
      ${header(subject)}
      ${body({
          subject,
          receiver: cardData.receiver,
          message: cardData.message,
          withClosure: cardData.includeClousre === undefined ? true : cardData.includeClousre,
          closureData: cardData.closureData
        })}
    </mjml>
  `;
}

function header(title: string) {
  return `
    <mj-head>
      <mj-title>${title}</mj-title>
      <mj-font name="Work Sans" href="https://fonts.googleapis.com/css2?family=Work+Sans:wght@400;600&display=swap"></mj-font>
      <mj-preview>Pre-header Text</mj-preview>
      <mj-attributes>
        <mj-all font-family="'Work Sans', Helvetica, Arial, sans-serif"></mj-all>
        <mj-text font-weight="400" font-size="14px" color="#000000" line-height="23px" font-family="'Work Sans', Helvetica, Arial, sans-serif"></mj-text>
      </mj-attributes>
      <mj-style inline="inline">
        .body {
          min-width: 400px;
        }
        .body-section {
					border: solid 1px #dcdde1;
        }
        .card-title-container{
        	border: 1px solid #0774D3;
        }
        .app-tbl-lable {
          font-weight: 600;
          width:130px;
          padding: 2px 0px 2px 10px;
          line-height: 22px;
          font-size:14px;
          color: #000;
          min-width: 130px;
        }
        .app-tbl-val {
          font-size: 14px;
          color: #0774d3;
          font-weight: bold;
          min-width: 120px;
        }
        .app-tbl-icon {
          width: 50px;
         height: 50px;
        }
        a {
          color: #523785;
        }
      </mj-style>
    </mj-head>
  `;
}

function body(props: {subject: string, receiver: Receiver, message: string, withClosure: boolean, closureData?: ClosureData}) {
  const {subject, receiver, message, withClosure, closureData} = props;
  return `
    <mj-body background-color="#ffffff" width="600px" css-class="body">
      ${banner()}
      ${card({subject, receiver, message, withClosure, closureData})}
      ${footer()}
    </mj-body>
  `;
}

function banner() {
  return `
  <mj-section full-width="full-width" background-color="#ffffff" padding-bottom="0">
    <mj-column width="100%">
      <mj-image src="https://i.ibb.co/yFJnPWv/logo-icgc-daco.png" alt="ICGC ARGO LOGO" align="center" width="250px" height="36px" padding="0" />
      <mj-text color="#ffffff" font-weight="" font-size="12px" align="center" text-transform="uppercase" font-size="12px" letter-spacing="0px" padding-top="10px" padding-bottom="22px">
        <a href="https://daco.icgc-argo.org/">ICGC DATA ACCESS COMPLIANCE OFFICE</a>
      </mj-text>
    </mj-column>
  </mj-section>
  `;
}

function card(props: {subject: string, receiver: Receiver, message: string, withClosure: boolean, closureData?: ClosureData}) {
  const { subject, receiver, message, withClosure, closureData } = props;
  return `
    ${cardHeader(subject)}
    ${cardBody({receiver, message, withClosure, closureData})}
  `;
}

function cardHeader(title: string) {
  return `
    <mj-section background-color="#0774D3" padding="10px 22px 13px" css-class="card-title-container">
      <mj-column width="100%" padding="0">
        <mj-text color="#ffffff" font-weight="bold" align="center" font-size="20px" padding="0">
          ${title}
        </mj-text>
      </mj-column>
    </mj-section>
  `;
}

function cardBody(props: {receiver: Receiver, message: string, withClosure: boolean, closureData?: ClosureData}) {
  const { receiver, message, withClosure, closureData} = props;
  return `
    <mj-wrapper padding="30px 32px 52px 32px" css-class="body-section">
      ${greeting(receiver)}
      ${message}
      ${ withClosure ? closure(c(closureData)) : ''}
    </mj-wrapper>
  `;
}

type Receiver = {
  title?: string,
  first: string,
  last: string,
  suffix?: string
};

function greeting(args: Receiver) {
  return `
    <mj-section padding="0">
      <mj-column padding="0">
      ${text(
        `Dear ${args.title ? args.title + ' ' : '' }${args.first} ${args.last}${args.suffix ? ' ' + args.suffix : ''},`
      , { ...defaultTextStyle,  padding: '0px 0px 20px 0px' })}
      </mj-column>
    </mj-section>
  `;
}

export function appInfoBox(app: Application) {
  const applicantInfo = app.sections.applicant.info;
  const applicantName =
    `${applicantInfo.title ? applicantInfo.title + ' ' : '' }${applicantInfo.firstName} ${applicantInfo.lastName}${applicantInfo.suffix ? ' ' + applicantInfo.suffix : ''}`;

  return `
    <mj-section padding="0px 0px 20px 0px">
      <mj-column border="1px #dcdde1 solid" padding="0" >
        <mj-table font-weight="400"
                  font-size="16px"
                  color="#000000"
                  padding="10px 16px"
                  line-height="24px" >
                  <tr>
                    <td valign="top" width="60px" style="padding-top: 5px">
                      <img src="https://i.ibb.co/XLzmWXB/icons-brand-controlled-data-3x.png" class="app-tbl-icon"/>
                    </td>
                    <td>
                      <table width="100%">
                        <tr>
                          <td class="app-tbl-lable">
                            Application #:
                          </td>
                          <td class="app-tbl-val">
                            ${app.appId}
                          </td>
                        </tr>

                        <tr>
                          <td class="app-tbl-lable">
                            Applicant:
                          </td>
                          <td class="app-tbl-val">
                            ${applicantName}
                          </td>
                        </tr>

                        <tr>
                          <td class="app-tbl-lable">
                            Institution:
                          </td>
                          <td class="app-tbl-val">
                            ${applicantInfo.primaryAffiliation}
                          </td>
                        </tr>

                        <tr>
                          <td class="app-tbl-lable">
                            Submitted on:
                          </td>
                          <td class="app-tbl-val">
                            ${moment(app.submittedAtUtc).format('MMM D, YYYY [at] LT')}
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
        </mj-table>
      </mj-column>
    </mj-section>
  `;
}

function closure(props: {guideLink: string, guideText: string}) {
  const { guideLink, guideText } = props;
  return `
    <mj-section padding="0">
      <mj-column padding="0">
        ${text(
          `If you have any questions, please consult the <a href=${guideLink}>${guideText}</a> or <a href="https://platform.icgc-argo.org/contact">contact the ICGC DACO team</a>.`
          , { ...defaultTextStyle,  padding: '20px 0px 0px 0px' })
        }
        ${text(
          `Thank you for your interest in the International Cancer Genome Consortium.`,
          { ...defaultTextStyle,  padding: '20px 0px 0px 0px' })

        }
        ${text(
          `Sincerely, <br />
          The <a href="https://daco.icgc-argo.org/">ICGC DACO</a> Team`, { ...defaultTextStyle,  padding: '20px 0px 0px 0px' }
          )
        }
      </mj-column>
    </mj-section>
  `;
}

function footer() {
  return `
    <mj-wrapper full-width="full-width" padding="47px 0px 13px 0px">
    <mj-section padding="0">
      <mj-group>
        <mj-column width="100%" padding-right="0">
          <mj-text font-size="12px" align="center" line-height="16px" >
            <a class="" href="https://platform.icgc-argo.org/contact">Contact Us</a>&#xA0;&#xA0;&#xA0;/&#xA0;&#xA0;&#xA0;<a class="" href="https://www.icgc-argo.org/page/72/introduction-and-goals-">Policies & Guidelines</a>&#xA0;&#xA0;&#xA0;/&#xA0;&#xA0;&#xA0;<a class="" href="https://docs.icgc-argo.org/docs/data-access/data-access">Help Guides</a>&#xA0;&#xA0;&#xA0;/&#xA0;&#xA0;&#xA0;<a class="" href="https://www.icgc-argo.org">Controlled Data Users</a>
          </mj-text>
          <mj-text font-size="12px" align="center" line-height="16px" padding-top="0" >
            <a class="" href="https://www.icgc-argo.org/">ICGC ARGO Website</a>&#xA0;&#xA0;&#xA0;/&#xA0;&#xA0;&#xA0;<a class="" href="https://platform.icgc-argo.org/">ARGO Data Platform</a>
          </mj-text>
        </mj-column>
      </mj-group>
    </mj-section>
      <mj-section padding="0">
      <mj-column width="100%" padding="0">
        <mj-text color="#000000" font-size="12px" line-height="16px" padding="12px 0px" font-weight="" align="center">
          © 2021 ICGC Data Access Compliance Office. All rights reserved.
        </mj-text>
      </mj-column>
    </mj-section>
  </mj-wrapper>
  `;
}

export function action(text: string, buttonText: string, buttonLink: string) {
  return `
      <mj-section width="75%" padding="0 15px 0 10px" background-color="F6F6F7" border="1px solid #DCDDE1" align="center">
      <mj-column width="50%">
          <mj-text color="#0774D3" font-size="12px" font-weight="bold">
            ${text}
          </mj-text>
      </mj-column>
      <mj-column width="50%">
          <mj-button background-color="#7F55CC" text-transform="uppercase" align="center" color="#ffffff" font-size="13px" font-weight="bold" href="${buttonLink}" width="230px" height="30px" padding-top="15px">
            ${buttonText}
          </mj-button>
    </mj-column>
    </mj-section>
  `;
}

export function actionGetStarted(text: string, buttonText: string, buttonLink: string) {
  return `
  <mj-section padding="13px 0 13px 0" background-color="#F6F6F7" border="1px solid #DCDDE1">
    <mj-column width="20%" padding="13px 0px 13px 18px">
      <mj-text color="#0774D3"
              align="center"
              padding="0px 0px 0px 0px"
              font-size="14px"
              font-weight="bold">
        ${text}
      </mj-text>
    </mj-column>
    <mj-column width="50%" padding="0px 0px 0px 0px">
      <mj-button background-color="#7F55CC"
                text-transform="uppercase"
                color="#ffffff"
                font-size="12px"
                font-weight="bold"
                font-style="normal"
                href="${buttonLink}"
                border-radius="0px"
                width="220px"
                inner-padding="16px 24px"
                padding="0px 0px 0px 0px">
        ${buttonText}
      </mj-button>
    </mj-column>
  </mj-section>
  `;
}

export function text(content: string, style: any = defaultTextStyle) {
  return `
    <mj-text ${Object.keys(style).map((k: string) => `${k}="${style[k]}"`).join(' ')}>
      ${content}
    </mj-text>
  `;
}

export function textParagraphSection(content: string,
                                     style: object = defaultTextStyle,
                                     padding: string = '0') {
  return `
    <mj-section padding="${padding}">
      <mj-column padding="0">
        ${text(content, style)}
      </mj-column>
    </mj-section>
  `;
}