import styled from 'styled-components'
import { themeConfig } from '../../theme/config'

export const Button = styled.button`
  border: 0;
  border-radius: 5px;
  padding: 5px 10px;
  background-color: ${themeConfig.primary};
  color: ${themeConfig.textColor.primary};
  cursor: pointer;

  &:hover {
    background-color: ${themeConfig.secondary};
  }
`

export const RedButton = styled.button`
  border: 0;
  border-radius: 5px;
  padding: 5px 10px;
  background-color: #f94c4c;
  color: #ffffff;
  cursor: pointer;

  &:hover {
    background-color: #f56161;
    cursor: pointer;
  }
`
