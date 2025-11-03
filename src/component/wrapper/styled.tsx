import styled from 'styled-components'
import { themeConfig } from '../../theme/config'

export const Wrapper = styled.div`
  color: ${themeConfig.textColor.contrast};
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  height: 100vh;
  margin: 0 10px;
  font-size: ${themeConfig.textSize.default};
  font-family: ${themeConfig.fontFamily};
  overflow: hidden;

  button,
  li {
    font-size: ${themeConfig.textSize.default};
    font-family: ${themeConfig.fontFamily};
  }
`
