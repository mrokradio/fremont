import { Body, Controller, Get, Post, Query, UnauthorizedException, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { AuthGoogleUrlResponse, AuthLoginResponse, AuthMicrosoftUrlResponse, AuthUser } from '@fremont/shared';
import { CurrentUser } from './current-user.decorator';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { GoogleAuthUrlDto } from './dto/google-auth-url.dto';
import { GoogleExchangeDto } from './dto/google-exchange.dto';
import { LoginDto } from './dto/login.dto';
import { MicrosoftAuthUrlDto } from './dto/microsoft-auth-url.dto';
import { MicrosoftExchangeDto } from './dto/microsoft-exchange.dto';
import type { AuthenticatedUser } from './auth.types';

@Controller('/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Throttle({ default: { ttl: 60000, limit: 10 } })
  @Post('/login')
  async login(@Body() dto: LoginDto): Promise<AuthLoginResponse> {
    return this.authService.login(dto.email, dto.password);
  }

  @Get('/google/url')
  getGoogleAuthUrl(@Query() query: GoogleAuthUrlDto): AuthGoogleUrlResponse {
    return this.authService.getGoogleAuthUrl(query.redirectUri);
  }

  @Post('/google/exchange')
  async exchangeGoogleCode(@Body() dto: GoogleExchangeDto): Promise<AuthLoginResponse> {
    return this.authService.exchangeGoogleCode(dto.code, dto.redirectUri, dto.state);
  }

  @Get('/microsoft/url')
  getMicrosoftAuthUrl(@Query() query: MicrosoftAuthUrlDto): AuthMicrosoftUrlResponse {
    return this.authService.getMicrosoftAuthUrl(query.redirectUri);
  }

  @Post('/microsoft/exchange')
  async exchangeMicrosoftCode(@Body() dto: MicrosoftExchangeDto): Promise<AuthLoginResponse> {
    return this.authService.exchangeMicrosoftCode(dto.code, dto.redirectUri, dto.state);
  }

  @UseGuards(AuthGuard)
  @Get('/me')
  async me(@CurrentUser() user: AuthenticatedUser | undefined): Promise<AuthUser> {
    if (!user) {
      throw new UnauthorizedException('Not authenticated');
    }
    return this.authService.me(user.id);
  }
}
